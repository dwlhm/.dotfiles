import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeEngine, fakeRunner, until } from "./testkit";
import { Store } from "./store";
import { readDoc } from "./frontmatter";
import { checkTask } from "./records";

const sh = async (dir: string, ...a: string[]) => (await new Response(Bun.spawn(["git", "-C", dir, ...a], { stdout: "pipe", stderr: "pipe" }).stdout).text()).trim();

async function repo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "wf-split-"));
  for (const a of [["init", "-q", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]]) await sh(dir, ...a);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/a.txt"), "a0\n");
  writeFileSync(join(dir, "src/b.txt"), "b0\n");
  writeFileSync(join(dir, "README.md"), "# r\n");
  await sh(dir, "add", "-A");
  await sh(dir, "commit", "-qm", "init");
  return dir;
}

type K = Awaited<ReturnType<typeof makeEngine>>;
const running = (k: K, id: string) => [...k.engine.active.values()].find((a) => a.step.id === id && a.run.terminal);
const fix = (dir: string) => ({ command: "fix", goal: "a and b are 1", folder: dir, options: { only: ["src"], check: "true" } });
const SPLIT = "step: a is 1\nonly: src/a.txt\ncheck: grep -q a1 src/a.txt\n\nstep: b is 1\nonly: src/b.txt\ncheck: grep -q b1 src/b.txt";

test("too_big: the step becomes its sub-steps, which run, land and merge; the result lists them", async () => {
  const dir = await repo();
  const k = await makeEngine();
  const task = await k.engine.submit(fix(dir));
  const done = k.engine.wait(task);
  await until(() => !!running(k, "w1.1"));
  await k.engine.report("w1.1-r1", "too_big", SPLIT);
  const step = task.steps[0];
  await until(() => !!running(k, "w1.1.1") && !!running(k, "w1.1.2")); // both at once
  expect(step.status).toBe("split");
  expect(step.runs[0]).toMatchObject({ outcome: "too_big", summary: "Split into 2 sub-steps:" });
  expect(step.steps.map((s) => [s.id, s.only, s.branch])).toEqual([["w1.1.1", ["src/a.txt"], "wf/w1.1.1"], ["w1.1.2", ["src/b.txt"], "wf/w1.1.2"]]);
  expect(existsSync(step.worktree!)).toBe(false); // the step's own clean worktree is gone
  expect(await sh(dir, "branch", "--list", "wf/w1.1")).toBe("");
  writeFileSync(join(step.steps[0].worktree!, "src/a.txt"), "a1\n");
  writeFileSync(join(step.steps[1].worktree!, "src/b.txt"), "b1\n");
  await k.engine.report("w1.1.1-r1", "done", "a done");
  await k.engine.report("w1.1.2-r1", "done", "b done");
  await until(() => !!running(k, "w1.2")); // the curator comes after the split step ends
  await k.engine.report(running(k, "w1.2")!.run.id, "done", "nothing");
  const r = await done;
  expect(r.task.status).toBe("done");
  expect(r.text).toMatch(/^### w1\.1\.1: a is 1\nChanged src\/a\.txt[\s\S]*a done\n\n### w1\.1\.2: b is 1\nChanged src\/b\.txt[\s\S]*b done\n\nKnowledge: nothing new to record\.$/);
  expect(await sh(dir, "show", "wf/integration:src/a.txt")).toBe("a1");
  expect(await sh(dir, "show", "wf/integration:src/b.txt")).toBe("b1");
  expect(checkTask("w1.md", readDoc(new Store(k.brain, k.spec).path(task)).data, k.spec)).toEqual([]);
});

test("too_big: sub-steps outside the step's paths go back; too deep needs the user", async () => {
  const dir = await repo();
  const k = await makeEngine();
  const task = await k.engine.submit(fix(dir));
  await until(() => !!running(k, "w1.1"));
  await k.engine.report("w1.1-r1", "too_big", "step: readme\nonly: README.md\ncheck: true");
  await until(() => !!running(k, "w1.1"));
  expect(task.steps[0].runs[0]).toMatchObject({ outcome: "fail" });
  expect(k.host.spawned[1].argv.at(-1)).toContain("sub-step 1 may edit README.md, outside this step's paths (src)");
  const blocked = k.engine.wait(task);
  await k.engine.report("w1.1-r2", "too_big", SPLIT);
  await until(() => !!running(k, "w1.1.1"));
  await k.engine.report("w1.1.1-r1", "too_big", "step: half\nonly: src/a.txt\ncheck: true");
  const r = await blocked;
  expect(r.task.status).toBe("blocked");
  expect(r.text).toMatch(/^w1\.1\.1 needs splitting again, deeper than plan_depth 2: the goal needs rethinking with you/);
});

test("too_big: a sub-step after its sibling sees its work; a restart recovers nested runs", async () => {
  const dir = await repo();
  const k = await makeEngine({ runners: [fakeRunner("oc", ["m1", "m2"])] }); // a second model to fall back on
  const task = await k.engine.submit(fix(dir));
  await until(() => !!running(k, "w1.1"));
  await k.engine.report("w1.1-r1", "too_big", "step: a is 1\nonly: src/a.txt\ncheck: grep -q a1 src/a.txt\n\nstep: b copies a\nonly: src/b.txt\ncheck: grep -q a1 src/b.txt\nafter: 1");
  await until(() => !!running(k, "w1.1.1"));
  writeFileSync(join(task.steps[0].steps[0].worktree!, "src/a.txt"), "a1\n");
  await k.engine.report("w1.1.1-r1", "done", "a done");
  await until(() => !!running(k, "w1.1.2"));
  const second = task.steps[0].steps[1];
  expect(readFileSync(join(second.worktree!, "src/a.txt"), "utf8")).toBe("a1\n");

  const { Engine } = await import("./engine");
  const again = new Engine({ ...k.engine.d, store: new Store(k.brain, k.spec) });
  await again.recover();
  await until(() => [...again.active.values()].some((a) => a.step.id === "w1.1.2" && a.run.id === "w1.1.2-r2" && a.run.terminal));
  const reloaded = again.tasks.get(task.id)!;
  expect(reloaded.steps[0].steps[1].runs[0]).toMatchObject({ outcome: "infra", summary: "the engine restarted while this run was open" });
  expect(reloaded.steps[0].steps[1].runs[1]).toMatchObject({ model: "m2", outcome: null });
});
