import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPlan, parsePlan, showPlan } from "./planfmt";
import { makeEngine, fakeRunner, until } from "./testkit";
import { approve, tell } from "./build";
import { loadSpec } from "./spec";
import { specDir } from "./cli";
import { checkTask } from "./records";
import { readDoc } from "./frontmatter";
import { Store } from "./store";

const limits = loadSpec(specDir()).policy.limits;
const sh = async (dir: string, ...a: string[]) => (await new Response(Bun.spawn(["git", "-C", dir, ...a], { stdout: "pipe", stderr: "pipe" }).stdout).text()).trim();

test("plan format: blocks parse; the engine's rules are explained per step", () => {
  const p = parsePlan("step: add the type\nonly: src/types.ts\ncheck: bun test\n\n- step: use it\n  only: src/a.ts, src/b.ts\n  check: `bun test`\n  after: 1\nlater: wire the UI");
  expect("plan" in p && p.plan).toEqual({
    steps: [{ title: "add the type", only: ["src/types.ts"], check: "bun test", after: [] }, { title: "use it", only: ["src/a.ts", "src/b.ts"], check: "bun test", after: [1] }],
    later: "wire the UI",
  });
  expect(parsePlan("only: x")).toEqual({ error: '"only:" comes before any "step:"' });
  expect(parsePlan("Here is my plan: do things")).toEqual({ error: 'cannot read this line of the plan: "Here is my plan: do things"' });
  const bad = { steps: [{ title: "a", only: [], check: "", after: [2] }, { title: "b", only: ["x"], check: "c", after: [] }] };
  expect(checkPlan(bad, limits)).toEqual(['step 1 ("a") has no "only:" paths', 'step 1 ("a") has no "check:"', "step 1 comes after 2, which is not an earlier step"]);
  const clash = { steps: [{ title: "a", only: ["src/**"], check: "t", after: [] }, { title: "b", only: ["src/a.ts"], check: "t", after: [] }] };
  expect(checkPlan(clash, limits)).toEqual(['steps 1 and 2 can run at the same time but both may edit src; separate their paths or order them with "after:"']);
  expect(checkPlan({ steps: [clash.steps[0], { ...clash.steps[1], after: [1] }] }, limits)).toEqual([]); // ordered: fine
  const one = parsePlan("step: a\nonly: x\ncheck: t\nqa: qa web run\nlater: more");
  expect("plan" in one && showPlan(one.plan)).toBe("1. a\n   only: x · check: t · qa: qa web run\nlater: more");
});

async function repo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "wf-build-"));
  for (const a of [["init", "-q", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]]) await sh(dir, ...a);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/a.txt"), "a0\n");
  writeFileSync(join(dir, "src/b.txt"), "b0\n");
  await sh(dir, "add", "-A");
  await sh(dir, "commit", "-qm", "init");
  return dir;
}

// One agent with a small and a medium model: the planner is medium tier.
const runners = [fakeRunner("oc", ["s"], { models: [{ id: "s", tier: "small", cost: 0 }, { id: "m", tier: "medium", cost: 0 }] })];
type K = Awaited<ReturnType<typeof makeEngine>>;
const activeRole = (k: K, role: string) => [...k.engine.active.values()].filter((a) => a.step.role === role && a.run.terminal);
async function reportRole(k: K, role: string, text: string, n = 1): Promise<void> {
  await until(() => activeRole(k, role).length >= n);
  for (const a of activeRole(k, role)) await k.engine.report(a.run.id, "done", text);
}
const PLAN2 = "step: a is 1\nonly: src/a.txt\ncheck: grep -q a1 src/a.txt\n\nstep: b is 1\nonly: src/b.txt\ncheck: grep -q b1 src/b.txt";
const check = "grep -q a1 src/a.txt && grep -q b1 src/b.txt";

test("build: plan → approval → parallel steps in their own worktrees → integration check → done", async () => {
  const dir = await repo();
  const k = await makeEngine({ runners });
  const task = await k.engine.submit({ command: "build", goal: "a and b are 1", folder: dir, options: { check } });
  const planned = k.engine.wait(task);
  await until(() => activeRole(k, "plan").length > 0);
  expect(k.host.spawned[0].argv.at(-1)).toContain(`The whole goal is proven when this passes: \`${check}\``);
  await reportRole(k, "plan", PLAN2);
  const p = await planned;
  expect(p.task.status).toBe("awaiting_approval");
  expect(p.text).toBe("1. a is 1\n   only: src/a.txt · check: grep -q a1 src/a.txt\n2. b is 1\n   only: src/b.txt · check: grep -q b1 src/b.txt");
  expect(checkTask("w1.md", readDoc(new Store(k.brain, k.spec).path(task)).data, k.spec)).toEqual([]);
  expect(readDoc(new Store(k.brain, k.spec).path(task)).body).toContain(`## Plan — approve it: wf approve w1 · change it: wf tell w1 "…"`);
  approve(k.engine, task);
  const done = k.engine.wait(task);
  await until(() => activeRole(k, "implement").length === 2); // both at once
  const [a, b] = task.steps.filter((s) => s.role === "implement");
  expect(a.worktree).not.toBe(b.worktree);
  writeFileSync(join(a.worktree!, "src/a.txt"), "a1\n");
  writeFileSync(join(b.worktree!, "src/b.txt"), "b1\n");
  await reportRole(k, "implement", "done", 2);
  await reportRole(k, "curate", "nothing");
  const r = await done;
  expect(r.task.status).toBe("done");
  expect(r.text).toMatch(/^## w1\.2: a is 1\n\nChanged src\/a\.txt[\s\S]*\n\n## w1\.3: b is 1\n\nChanged src\/b\.txt[\s\S]*\n\nKnowledge: nothing new to record\.$/);
  expect(r.task.options.final_check).toBe("passed");
  expect(await sh(dir, "show", "wf/integration:src/a.txt")).toBe("a1");
  expect(await sh(dir, "show", "wf/integration:src/b.txt")).toBe("b1");
  expect(k.logs.join("\n")).toContain("w1 integration check passed");
});

test("build: a bad plan goes back with the reasons; tell replaces a proposal; just-go and small plans skip approval", async () => {
  const dir = await repo();
  const k = await makeEngine({ runners });
  const task = await k.engine.submit({ command: "build", goal: "x", folder: dir, options: { check } });
  await reportRole(k, "plan", "step: everything\ncheck: true");
  await until(() => k.host.spawned.length === 2);
  expect(k.host.spawned[1].argv.at(-1)).toContain('The plan breaks these rules:\n- step 1 ("everything") has no "only:" paths');
  const waiting = k.engine.wait(task);
  await reportRole(k, "plan", PLAN2);
  await waiting;
  tell(k.engine, task, "do b first, then a");
  const again = k.engine.wait(task);
  expect(task.steps.filter((s) => s.role === "implement")).toHaveLength(0); // the proposal is gone
  await until(() => k.host.spawned.length === 3);
  expect(k.host.spawned[2].argv.at(-1)).toContain("The user wants your plan changed: do b first, then a");
  await reportRole(k, "plan", "step: b is 1\nonly: src/b.txt\ncheck: grep -q b1 src/b.txt\n\nstep: a is 1\nonly: src/a.txt\ncheck: grep -q a1 src/a.txt\nafter: 1");
  expect((await again).text).toContain("2. a is 1\n   only: src/a.txt · check: grep -q a1 src/a.txt, after 1");
  expect(() => approve(k.engine, { ...task, status: "running" })).toThrow(/not waiting for approval/);

  const k2 = await makeEngine({ runners });
  const t2 = await k2.engine.submit({ command: "build", goal: "x", folder: dir, options: { check, "just-go": true } });
  await reportRole(k2, "plan", PLAN2);
  await until(() => activeRole(k2, "implement").length === 2);
  expect(t2.status).toBe("running");
  const t3 = await k2.engine.submit({ command: "build", goal: "x", folder: await repo(), options: { check: "true" } });
  await until(() => [...k2.engine.active.values()].some((a) => a.task === t3 && a.step.role === "plan" && a.run.terminal));
  await k2.engine.report([...k2.engine.active.values()].find((a) => a.task === t3)!.run.id, "done", "step: one\nonly: src/a.txt\ncheck: true");
  expect(t3.status).toBe("running"); // a one-step plan is small: no approval
});

test("build: a step after another starts from integration with its work; together-failure blocks", async () => {
  const dir = await repo();
  const k = await makeEngine({ runners });
  const task = await k.engine.submit({ command: "build", goal: "x", folder: dir, options: { check: "false", "just-go": true } });
  await reportRole(k, "plan", "step: a is 1\nonly: src/a.txt\ncheck: grep -q a1 src/a.txt\n\nstep: b copies a\nonly: src/b.txt\ncheck: grep -q a1 src/b.txt\nafter: 1");
  await until(() => activeRole(k, "implement").length === 1);
  const [s1, s2] = task.steps.filter((s) => s.role === "implement");
  writeFileSync(join(s1.worktree!, "src/a.txt"), "a1\n");
  const blocked = k.engine.wait(task);
  await reportRole(k, "implement", "done");
  await until(() => activeRole(k, "implement").some((a) => a.step === s2));
  expect(readFileSync(join(s2.worktree!, "src/a.txt"), "utf8")).toBe("a1\n"); // step 1's merged work is there
  expect(s2.base).toBe(await sh(dir, "rev-parse", "wf/integration"));
  writeFileSync(join(s2.worktree!, "src/b.txt"), "a1\n");
  await reportRole(k, "implement", "done");
  const r = await blocked;
  expect(r.task.status).toBe("blocked");
  expect(r.text).toMatch(/^Every step passed on its own, but together `false` fails on wf\/integration/);
});

test("build: a step naming a UI test gets a paired qa step; later: plans the next milestone", async () => {
  const dir = await repo();
  const k = await makeEngine({ runners });
  const task = await k.engine.submit({ command: "build", goal: "x", folder: dir, options: { check: "true", "just-go": true } });
  await reportRole(k, "plan", "step: a is 1\nonly: src/a.txt\ncheck: true\nqa: true\nlater: then b");
  await until(() => task.steps.some((s) => s.role === "qa"));
  const qa = task.steps.find((s) => s.role === "qa")!;
  const impl = task.steps.find((s) => s.role === "implement")!;
  expect(qa).toMatchObject({ check: "true", only: [".qa"], title: "UI test flows for: a is 1", deps: [impl.id] });
  await until(() => activeRole(k, "implement").length === 1);
  writeFileSync(join(impl.worktree!, "src/a.txt"), "a1\n");
  await reportRole(k, "implement", "done");
  await until(() => activeRole(k, "qa").length === 1);
  mkdirSync(join(qa.worktree!, ".qa"), { recursive: true });
  writeFileSync(join(qa.worktree!, ".qa/flow.anoa"), "open /\n");
  await k.engine.report(activeRole(k, "qa")[0].run.id, "done", "flow added");
  await until(() => task.steps.filter((s) => s.role === "plan").length === 2);
  expect(task.steps.filter((s) => s.role === "plan")[1].title).toBe("next milestone: then b");
  await until(() => activeRole(k, "plan").length === 1);
  expect(k.host.spawned.at(-1)!.argv.at(-1)).toContain("Now plan the next milestone: then b");
  expect(existsSync(join(dir, ".qa"))).toBe(false); // the user's checkout untouched
});

test("build: a plan waiting for approval survives an engine restart and can still be approved", async () => {
  const dir = await repo();
  const k = await makeEngine({ runners });
  const task = await k.engine.submit({ command: "build", goal: "x", folder: dir, options: { check } });
  const waiting = k.engine.wait(task);
  await reportRole(k, "plan", PLAN2);
  await waiting;
  const { Engine } = await import("./engine");
  const again = new Engine({ ...k.engine.d, store: new Store(k.brain, k.spec) });
  await again.recover();
  const reloaded = again.tasks.get(task.id)!;
  expect(reloaded.status).toBe("awaiting_approval");
  expect(again.active.size).toBe(0); // nothing runs while it waits
  approve(again, reloaded);
  await until(() => [...again.active.values()].filter((a) => a.step.role === "implement" && a.run.terminal).length === 2);
});
