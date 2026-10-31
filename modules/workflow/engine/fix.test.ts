import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeEngine, fakeRunner, settle, until } from "./testkit";
import type { Knowledge } from "./knowledge";
import { repoDir } from "./repo";

const sh = async (dir: string, ...a: string[]) => (await new Response(Bun.spawn(["git", "-C", dir, ...a], { stdout: "pipe", stderr: "pipe" }).stdout).text()).trim();

async function repo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "wf-fix-"));
  for (const a of [["init", "-q", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]]) await sh(dir, ...a);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/a.ts"), "export const a = 1;\n");
  writeFileSync(join(dir, "README.md"), "# r\n");
  await sh(dir, "add", "-A");
  await sh(dir, "commit", "-qm", "init");
  return dir;
}

// The check passes once src/a.ts says 2: what the "worker" below is asked to do.
const CHECK = "grep -q 'a = 2' src/a.ts";
const fix = (folder: string, options: object = {}) => ({ command: "fix", goal: "make a 2", folder, options: { check: CHECK, ...options } });
const runOf = (k: Awaited<ReturnType<typeof makeEngine>>) => [...k.engine.active.values()][0];
/** Act as the worker: edit the step's worktree once the run has been started in it. */
async function work(k: Awaited<ReturnType<typeof makeEngine>>, file: string, text: string): Promise<void> {
  await until(() => k.engine.active.size > 0 && [...k.engine.active.values()].every((a) => a.run.terminal));
  writeFileSync(join(runOf(k).step.worktree!, file), text);
}
/** Wait until run `n` of the first step has been started. */
const started = (k: Awaited<ReturnType<typeof makeEngine>>, n: number) => until(() => k.host.spawned.length >= n);

test("fix: a worktree per step, the engine checks, commits and merges; the user's checkout is untouched", async () => {
  const dir = await repo();
  const head = await sh(dir, "rev-parse", "HEAD");
  const k = await makeEngine();
  const task = await k.engine.submit(fix(dir, { only: ["src/"] }));
  const waiting = k.engine.wait(task);
  await started(k, 1);
  const step = task.steps[0];
  expect(step).toMatchObject({ role: "implement", only: ["src"], check: CHECK, branch: "wf/w1.1" });
  expect(k.host.spawned[0].cwd).toBe(step.worktree!);
  expect(k.host.spawned[0].argv.at(-1)).toContain(`Edit only these paths: src\nThe step is done when this passes: \`${CHECK}\``);
  await work(k, "src/a.ts", "export const a = 2;\n");
  await k.engine.report("w1.1-r1", "done", "set a to 2");
  const r = await waiting;
  expect(r.task.status).toBe("done");
  expect(r.text).toMatch(/^Changed src\/a\.ts \(commit \w+\); `grep -q 'a = 2' src\/a\.ts` passed\. Merged into wf\/integration \(\w+\)\.\n\nset a to 2$/);
  expect(await sh(dir, "show", "wf/integration:src/a.ts")).toBe("export const a = 2;");
  expect(await sh(dir, "log", "-1", "--format=%s", "wf/integration")).toBe("wf w1.1: merge make a 2");
  expect(existsSync(step.worktree!)).toBe(false); // clean and merged: removed
  expect(await sh(dir, "branch", "--list", "wf/w1.1")).toBe(""); // merged: deleted
  expect(await sh(dir, "rev-parse", "HEAD")).toBe(head);
  expect(await sh(dir, "status", "--porcelain")).toBe("");
  expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe("export const a = 1;\n");
});

test("fix: a failed check, edits outside only, or no change retry with the reason as feedback", async () => {
  const dir = await repo();
  const k = await makeEngine();
  const task = await k.engine.submit(fix(dir, { only: ["src/"] }));
  const waiting = k.engine.wait(task);
  await settle();
  await k.engine.report("w1.1-r1", "done", "did nothing");
  await settle();
  expect(task.steps[0].runs[0]).toMatchObject({ outcome: "fail", summary: "No file was changed. Make the change itself, then report done." });
  await work(k, "src/a.ts", "export const a = 3;\n");
  await k.engine.report("w1.1-r2", "done", "set 3");
  await settle();
  expect(task.steps[0].runs[1].summary).toBe(`The check \`${CHECK}\` failed (run by wf, not by you):`);
  await started(k, 3);
  const prompt = k.host.spawned[2].argv.at(-1)!;
  expect(prompt).toContain("An earlier attempt at this step did not pass. Continue from the current files and fix this:\nThe check");
  await work(k, "src/a.ts", "export const a = 2;\n");
  await work(k, "README.md", "# changed\n");
  await k.engine.report("w1.1-r3", "done", "set 2");
  await settle();
  expect(task.steps[0].runs[2].summary).toBe("Changed files outside the allowed paths (src): README.md. Undo those and keep to the allowed paths.");
  // retries_per_tier = 2: three failures on the only tier leave nothing above it
  const r = await waiting;
  expect(r.task.status).toBe("failed");
  expect(k.host.spawned.map((s) => s.argv[2])).toEqual(["m1", "m1", "m1"]);
});

test("fix: quality failures retry the same model, then move up a tier", async () => {
  const dir = await repo();
  const two = fakeRunner("oc", ["s"], { models: [{ id: "s", tier: "small", cost: 0 }, { id: "m", tier: "medium", cost: 0 }] });
  const k = await makeEngine({ runners: [two] });
  await k.engine.submit(fix(dir));
  for (let n = 1; n <= 3; n++) {
    await started(k, n);
    await k.engine.report(`w1.1-r${n}`, "done", "nothing");
  }
  await started(k, 4);
  expect(k.host.spawned.map((s) => s.argv[2])).toEqual(["s", "s", "s", "m"]);
});

test("fix: the patch may not copy private context; conflicts with integration need the user", async () => {
  const dir = await repo();
  const secret = "the deploy key lives in the third drawer of the left cabinet";
  const kb: Knowledge = { context: () => [{ source: "projects/x.md", heading: "Ops", text: secret }] };
  const k = await makeEngine({ knowledge: kb });
  const task = await k.engine.submit(fix(dir));
  await settle();
  await work(k, "src/a.ts", `export const a = 2;\n// ${secret}\n`);
  await k.engine.report("w1.1-r1", "done", "ok");
  await settle();
  expect(readFileSync(join(k.state, "runs/w1.1-r1/report.md"), "utf8")).toContain(`copies private reference text (never copy it into files):\n- ${secret}\nRemove those lines.`);
  expect(task.steps[0].runs[0].outcome).toBe("fail");

  // Two tasks started together edit the same line: the second to land conflicts with the first.
  const dir2 = await repo();
  const k2 = await makeEngine();
  const t1 = await k2.engine.submit(fix(dir2, { check: "true" }));
  const t2 = await k2.engine.submit(fix(dir2, { check: "true" }));
  const w2 = k2.engine.wait(t2);
  await started(k2, 2);
  await until(() => [...k2.engine.active.values()].every((a) => a.run.terminal));
  writeFileSync(join(t1.steps[0].worktree!, "src/a.ts"), "export const a = 2;\n");
  writeFileSync(join(t2.steps[0].worktree!, "src/a.ts"), "export const a = 3;\n");
  await k2.engine.report("w1.1-r1", "done", "ok");
  await k2.engine.report("w2.1-r1", "done", "ok");
  const r = await w2;
  expect(t1.status).toBe("done");
  expect(r.task.status).toBe("blocked");
  expect(r.text).toMatch(/wf\/w2\.1 conflicts with wf\/integration in: src\/a\.ts\. The branch is kept/);
  expect(await sh(dir2, "branch", "--list", "wf/w2.1")).toContain("wf/w2.1");

  // A branch that already conflicts with integration is refused before any work starts.
  writeFileSync(join(dir2, "src/a.ts"), "export const a = 5;\n");
  await sh(dir2, "commit", "-qam", "the user moved on, differently");
  await expect(k2.engine.submit(fix(dir2))).rejects.toThrow(/your branch and wf\/integration conflict \(src\/a\.ts\)/);
});

test("fix: no-merge leaves the branch; the check is guessed only when unambiguous; a repo is needed", async () => {
  const dir = await repo();
  const k = await makeEngine();
  const task = await k.engine.submit(fix(dir, { "no-merge": true }));
  const waiting = k.engine.wait(task);
  await settle();
  await work(k, "src/a.ts", "export const a = 2;\n");
  await k.engine.report("w1.1-r1", "done", "ok");
  expect((await waiting).text).toMatch(/Left on branch wf\/w1\.1 \(.+\); not merged\./);
  expect(await sh(dir, "branch", "--list", "wf/integration")).toBe("");

  await expect(k.engine.submit({ command: "fix", goal: "x", folder: dir, options: {} })).rejects.toThrow(/cannot tell how to check work in .*; name it: check "<command>"/);
  writeFileSync(join(dir, "Makefile"), "test:\n\ttrue\n");
  await sh(dir, "add", "-A");
  await sh(dir, "commit", "-qm", "make");
  const guessed = await k.engine.submit({ command: "fix", goal: "x", folder: dir, options: {} });
  expect(guessed.steps[0].check).toBe("make test");
  await expect(k.engine.submit(fix(mkdtempSync(join(tmpdir(), "wf-norepo-"))))).rejects.toThrow(/not in a git repository/);
});

test("fix: from a subfolder, only paths and the worker's folder follow it inside the worktree", async () => {
  const dir = await repo();
  const k = await makeEngine();
  const task = await k.engine.submit(fix(join(dir, "src"), { only: ["a.ts"], check: "grep -q 'a = 2' a.ts" }));
  await started(k, 1);
  expect(task.steps[0].only).toEqual(["src/a.ts"]);
  expect(k.host.spawned[0].cwd).toBe(join(task.steps[0].worktree!, "src"));
});

test("fix: new work starts from the integration branch when it already holds the user's HEAD", async () => {
  const dir = await repo();
  const k = await makeEngine();
  const first = await k.engine.submit(fix(dir));
  const w1 = k.engine.wait(first);
  await work(k, "src/a.ts", "export const a = 2;\n");
  await k.engine.report("w1.1-r1", "done", "ok");
  await w1;
  const second = await k.engine.submit({ ...fix(dir), goal: "touch readme", options: { check: "grep -q 'a = 2' src/a.ts", only: ["README.md"] } });
  expect(second.options.base).toBe(await sh(dir, "rev-parse", "wf/integration")); // so a = 2 is already there
  await sh(dir, "commit", "-q", "--allow-empty", "-m", "user moved on");
  const third = await k.engine.submit(fix(dir));
  expect(third.options.base).not.toBe(await sh(dir, "rev-parse", "HEAD")); // diverged: both, merged (next test)
});

test("fix: when the user's branch and integration diverged, work starts from both merged", async () => {
  const dir = await repo();
  const k = await makeEngine();
  const first = await k.engine.submit(fix(dir));
  const w1 = k.engine.wait(first);
  await work(k, "src/a.ts", "export const a = 2;\n");
  await k.engine.report("w1.1-r1", "done", "ok");
  await w1;
  writeFileSync(join(dir, "README.md"), "# user edit\n");
  await sh(dir, "commit", "-qam", "user work on main");
  const head = await sh(dir, "rev-parse", "HEAD");
  const t = await k.engine.submit({ ...fix(dir), options: { check: "grep -q 'a = 2' src/a.ts && grep -q 'user edit' README.md" } });
  expect(await sh(dir, "rev-list", "--parents", "-n", "1", t.options.base as string)).toBe(`${t.options.base} ${await sh(dir, "rev-parse", "wf/integration")} ${head}`);
  expect(await sh(dir, "rev-parse", "HEAD")).toBe(head); // nothing of the user's moved
  expect(await sh(dir, "status", "--porcelain")).toBe("");
  writeFileSync(join(dir, "src/a.ts"), "export const a = 7;\n");
  await sh(dir, "commit", "-qam", "user conflicts with wf work");
  await expect(k.engine.submit(fix(dir))).rejects.toThrow(/your branch and wf\/integration conflict \(src\/a\.ts\); merge wf\/integration into your branch first/);
});

test("fix: merges where the integration branch is already checked out; refuses a dirty one", async () => {
  const dir = await repo();
  const elsewhere = mkdtempSync(join(tmpdir(), "wf-int-"));
  await sh(dir, "branch", "wf/integration");
  await sh(dir, "worktree", "add", "-q", join(elsewhere, "int"), "wf/integration"); // e.g. another wf state
  const k = await makeEngine();
  const t = await k.engine.submit(fix(dir));
  const w = k.engine.wait(t);
  await work(k, "src/a.ts", "export const a = 2;\n");
  await k.engine.report("w1.1-r1", "done", "ok");
  expect((await w).task.status).toBe("done");
  expect(readFileSync(join(elsewhere, "int", "src/a.ts"), "utf8")).toBe("export const a = 2;\n");
  writeFileSync(join(elsewhere, "int", "scratch.txt"), "user's\n");
  const t2 = await k.engine.submit({ ...fix(dir), options: { check: "true" } });
  const w2 = k.engine.wait(t2);
  await work(k, "README.md", "# x\n");
  await k.engine.report("w2.1-r1", "done", "ok");
  expect((await w2).text).toMatch(/wf\/integration is checked out with uncommitted changes in .*int; commit or clean them first/);
});

test("fix: a branch name already taken gets a suffix; a folder that cannot be prepared fails the step once", async () => {
  const dir = await repo();
  await sh(dir, "branch", "wf/w1.1"); // kept from another wf state
  const k = await makeEngine();
  const t = await k.engine.submit(fix(dir));
  expect(t.steps[0].branch).toBe("wf/w1.1-2");
  expect(t.steps[0].worktree!.endsWith("/w1.1-2")).toBe(true);

  const dir2 = await repo();
  const k2 = await makeEngine({ runners: [fakeRunner("a", ["a1", "a2"]), fakeRunner("b", ["b1"])] });
  mkdirSync(join(repoDir(k2.state, await sh(dir2, "rev-parse", "--show-toplevel")), "w1.1"), { recursive: true }); // not a worktree
  const t2 = await k2.engine.submit(fix(dir2));
  const r = await k2.engine.wait(t2);
  expect(r.task.status).toBe("failed");
  expect(t2.steps[0].runs).toHaveLength(1); // not retried on every runner
  expect(t2.steps[0].runs[0].summary).toMatch(/could not prepare its folder: .*w1\.1 exists but is not the wf\/w1\.1 worktree; move it away/);
  expect(k2.host.spawned).toHaveLength(0);
});
