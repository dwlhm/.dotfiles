import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeEngine, fakeRunner, settle } from "./testkit";
import { reconcile, NUDGE, NUDGE_SECONDS } from "./watch";
import { readDoc } from "./frontmatter";
import { checkTask } from "./records";
import { Store } from "./store";

const ask = { command: "ask", goal: "why is the build slow?", folder: "/tmp", options: { about: ["src/build/"] } };
const git = async (root: string, ...args: string[]) => {
  const p = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe" });
  return (await new Response(p.stdout).text()).trim();
};

test("ask: one run, reported done, closes the task, keeps the screen and commits the record", async () => {
  const k = await makeEngine();
  const task = await k.engine.submit(ask);
  const waiting = k.engine.wait(task);
  await settle();
  const sp = k.host.spawned[0];
  expect(sp).toMatchObject({ name: "wf-w1-1-r1", cwd: "/tmp", labels: { "wf.run": "w1.1-r1" }, env: { RUNNER_ONLY: "1" } });
  expect(sp.argv.at(-1)).toContain("wf report w1.1-r1 done");
  expect(sp.argv.at(-1)).toContain("Look at: src/build/");

  k.host.set(sp.address, { status: { state: "working" } });
  await reconcile(k.engine);
  await k.engine.report("w1.1-r1", "done", "Because of X.\nDetails…");
  const r = await waiting;
  await settle();

  expect(r.task.status).toBe("done");
  expect(r.text).toBe("Because of X.\nDetails…");
  expect(k.host.closed).toEqual([sp.address]);
  expect(readFileSync(join(k.state, "runs/w1.1-r1/screen.txt"), "utf8")).toBe(`screen of ${sp.address}`);
  const doc = readDoc(new Store(k.brain, k.spec).path(r.task));
  expect(checkTask("w1.md", doc.data, k.spec)).toEqual([]);
  expect(doc.body).toContain("## Answer\n\nBecause of X.");
  await k.store.flushed();
  expect(await git(k.brain, "log", "--format=%s")).toBe("docs(brain): wf w1 done\ndocs(brain): wf w1 started\ninit");
  expect(await git(k.brain, "show", "HEAD~1:tasks/2026-10/w1.md")).toContain("status: running");
  expect(await git(k.brain, "status", "--porcelain", "--", "tasks")).toBe("");
});

test("infra moves to the next eligible runner; when none is left the task fails with what was tried", async () => {
  const k = await makeEngine({ runners: [fakeRunner("oc", ["free-a", "free-b"])] });
  const task = await k.engine.submit(ask);
  const waiting = k.engine.wait(task);
  await settle();
  k.host.set("t1", { state: "finished", exit: 1 });
  await reconcile(k.engine);
  await settle();
  expect(k.host.spawned.map((s) => s.argv[2])).toEqual(["free-a", "free-b"]);
  expect(task.steps[0].runs[0]).toMatchObject({ outcome: "infra", summary: "the agent exited (code 1) without reporting" });
  k.host.set("t2", { state: "finished", exit: 137 });
  await reconcile(k.engine);
  const r = await waiting;
  expect(r.task.status).toBe("failed");
  expect(r.text).toMatch(/No runner left.*oc·free-a: the agent exited \(code 1\).*oc·free-b: the agent exited \(code 137\)/);
});

test("statuses before the first 'working' are startup noise until start_seconds runs out", async () => {
  const k = await makeEngine({ runners: [fakeRunner("oc", ["only"])] });
  await k.engine.submit(ask);
  await settle();
  k.host.set("t1", { status: { state: "blocked", kind: "auth" } });
  await reconcile(k.engine);
  expect(k.engine.active.size).toBe(1);
  k.clock.t += (k.spec.policy.limits.start_seconds + 1) * 1000;
  await reconcile(k.engine);
  await settle();
  expect(k.engine.active.size).toBe(0);
  expect(k.logs.join("\n")).toMatch(/w1\.1-r1 infra: did not start working within/);
  // A runner that states a tighter start limit is given up on sooner.
  const quick = await makeEngine({ runners: [fakeRunner("oc", ["only"], { startSeconds: 30 })] });
  await quick.engine.submit(ask);
  await settle();
  quick.clock.t += 31_000;
  await reconcile(quick.engine);
  await settle();
  expect(quick.logs.join("\n")).toMatch(/infra: did not start working within 30s/);
});

test("a worker that goes idle without reporting gets one reminder, then counts as infra", async () => {
  const k = await makeEngine({ runners: [fakeRunner("oc", ["only"])] });
  await k.engine.submit(ask);
  await settle();
  k.host.set("t1", { status: { state: "working" } });
  await reconcile(k.engine);
  k.host.set("t1", { status: { state: "idle" } });
  await reconcile(k.engine);
  expect(k.host.sent).toEqual([{ address: "t1", text: NUDGE }]);
  k.clock.t += 10_000;
  k.host.set("t1", { status: { state: "working" } });
  await reconcile(k.engine);
  k.host.set("t1", { status: { state: "idle" } });
  await reconcile(k.engine);
  expect(k.host.sent.length).toBe(2); // working again reset the reminder
  k.clock.t += (NUDGE_SECONDS + 1) * 1000;
  await reconcile(k.engine);
  expect(k.engine.active.size).toBe(0);
});

test("a permission prompt marks the task blocked and working again unblocks it", async () => {
  const k = await makeEngine();
  const task = await k.engine.submit(ask);
  await settle();
  k.host.set("t1", { status: { state: "working" } });
  await reconcile(k.engine);
  k.host.set("t1", { status: { state: "blocked", kind: "permission" } });
  await reconcile(k.engine);
  expect(task.status).toBe("blocked");
  k.host.set("t1", { status: { state: "working" } });
  await reconcile(k.engine);
  expect(task.status).toBe("running");
});

test("reports are checked: the run must be active, the outcome the role's, the text non-empty", async () => {
  const k = await makeEngine();
  await k.engine.submit(ask);
  await settle();
  await expect(k.engine.report("w9.1-r1", "done", "x")).rejects.toThrow(/not active/);
  await expect(k.engine.report("w1.1-r1", "fail", "x")).rejects.toThrow(/'fail' is not an outcome this role reports/);
  await expect(k.engine.report("w1.1-r1", "too_big", "x")).rejects.toThrow(/not an outcome this role reports \(done, stuck, question\)/);
  await expect(k.engine.report("w1.1-r1", "done", "  ")).rejects.toThrow(/empty/);
  await k.engine.report("w1.1-r1", "done", "ok");
  await expect(k.engine.report("w1.1-r1", "done", "again")).rejects.toThrow(/not active/);
});

test("stuck and question leave the task waiting for the user, not failed", async () => {
  const k = await makeEngine();
  const task = await k.engine.submit(ask);
  const waiting = k.engine.wait(task);
  await settle();
  await k.engine.report("w1.1-r1", "question", "Measure cold or warm builds?");
  const r = await waiting;
  expect(r.task).toMatchObject({ status: "blocked", closed: null });
  expect(r.text).toBe("Measure cold or warm builds?");
});

test("report-to gets the result; unknown or ineligible agents are refused before a task exists", async () => {
  const k = await makeEngine();
  const task = await k.engine.submit({ ...ask, options: { "report-to": "t42" } });
  await settle();
  await k.engine.report("w1.1-r1", "done", "the answer");
  expect(k.host.sent.at(-1)).toEqual({ address: "t42", text: `<wf from="${task.id}" status="done">\nthe answer\n</wf>` });
  await expect(k.engine.submit({ ...ask, options: { with: ["gpt"] } })).rejects.toThrow(/unknown agent 'gpt' \(known: oc\)/);
  const weak = await makeEngine({ runners: [fakeRunner("ro", ["m"], { enforces: ["read", "shell-report"] })] });
  await expect(weak.engine.submit(ask)).rejects.toThrow(/no agent can do 'ask' \(it needs: read, shell-git-read, shell-report, tier small\+\)/);
  expect(existsSync(join(weak.brain, "tasks"))).toBe(false);
  await expect(k.engine.submit({ ...ask, command: "deploy" })).rejects.toThrow(/unknown command 'deploy'/);
});

test("a spawn failure is an infra failure of that run", async () => {
  const k = await makeEngine({ runners: [fakeRunner("oc", ["only"])] });
  k.host.failSpawn = true;
  const task = await k.engine.submit(ask);
  const r = await k.engine.wait(task);
  expect(r.task.status).toBe("failed");
  expect(r.text).toMatch(/could not start: hc is not running/);
});

test("after a restart, runs left open count as infra and the step goes on", async () => {
  const k = await makeEngine({ runners: [fakeRunner("oc", ["a", "b"])] });
  await k.engine.submit(ask);
  await settle();
  const { Engine } = await import("./engine");
  const again = new Engine({ ...k.engine.d, store: new Store(k.brain, k.spec) });
  await again.recover();
  await settle();
  const task = [...again.active.values()][0].task;
  expect(task.steps[0].runs.map((r) => [r.id, r.outcome])).toEqual([["w1.1-r1", "infra"], ["w1.1-r2", null]]);
  expect(task.steps[0].runs[0].summary).toBe("the engine restarted while this run was open");
  expect(new Store(k.brain, k.spec).nextId()).toBe("w2");
});
