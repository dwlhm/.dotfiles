import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeRunner, makeEngine, settle, until } from "./testkit";
import { giveBack, pause, resume, show, status, stop, take, tell } from "./control";
import { reconcile, NUDGE_SECONDS } from "./watch";
import { readDoc } from "./frontmatter";
import { checkTask } from "./records";
import { Store } from "./store";
import { serve } from "./server";
import { request } from "./client";

const ask = { command: "ask", goal: "why is the build slow?", folder: "/tmp", options: { about: ["src/build/"] } };
const sh = async (dir: string, ...a: string[]) =>
  (await new Response(Bun.spawn(["git", "-C", dir, ...a], { stdout: "pipe", stderr: "pipe" }).stdout).text()).trim();

async function repo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "wf-control-"));
  for (const a of [["init", "-q", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]]) await sh(dir, ...a);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/a.txt"), "a0\n");
  writeFileSync(join(dir, "src/b.txt"), "b0\n");
  await sh(dir, "add", "-A");
  await sh(dir, "commit", "-qm", "init");
  return dir;
}

test("status: open tasks with work progress and the runs in flight; show: tree and run details", async () => {
  const k = await makeEngine();
  await k.engine.submit(ask);
  await settle();

  expect(status(k.engine)).toBe(
    "w1 ask running: why is the build slow? (0/1)\n  w1.1-r1 oc·m1 t1",
  );
  expect(show(k.engine, "w1")).toBe(
    "w1 ask running: why is the build slow?\nw1.1 [running] why is the build slow?\n  w1.1-r1 oc·m1 running (t1)",
  );
  expect(show(k.engine, "w1.1")).toBe("w1.1 [running] why is the build slow?\n  w1.1-r1 oc·m1 running (t1)");

  const run = show(k.engine, "w1.1-r1");
  expect(run).toContain("runner: oc");
  expect(run).toContain("model: m1");
  expect(run).toContain("terminal: t1");
  expect(run).toContain("outcome: running");
  // The private context is on disk from dispatch (the leak check needs it even after a restart).
  expect(run).toMatch(/artifacts: \n    .*runs\/w1\.1-r1\/context\.md$/);

  expect(() => show(k.engine, "nope")).toThrow(/nothing matches 'nope'/);
  expect(() => pause(k.engine, "w1.1")).toThrow(/pause takes a task, not w1.1 \(w1 is running\)/);
});

test("show: an ended run lists the artifacts that exist; status counts done leaves", async () => {
  const k = await makeEngine({ runners: [fakeRunner("oc", ["a", "b"])] });
  const task = await k.engine.submit(ask);
  await settle();
  k.host.set("t1", { state: "finished", exit: 1 });
  await reconcile(k.engine);
  await settle();

  const first = show(k.engine, "w1.1-r1");
  expect(first).toContain("outcome: infra");
  expect(first).toContain("summary: the agent exited (code 1) without reporting");
  expect(first).toContain(join(k.state, "runs/w1.1-r1/report.md"));
  expect(first).toContain(join(k.state, "runs/w1.1-r1/screen.txt"));
  expect(first).toContain(join(k.state, "runs/w1.1-r1/context.md"));
  expect(show(k.engine, "w1.1-r2")).toContain("outcome: running");

  await k.engine.report("w1.1-r2", "done", "the answer");
  await settle();
  expect(task.status).toBe("done");
  expect(status(k.engine)).toBe("no open tasks");
});

test("pause keeps running work but dispatches nothing new; resume advances and closes", async () => {
  const k = await makeEngine();
  const task = await k.engine.submit(ask);
  await settle();

  expect(pause(k.engine, "w1")).toBe("w1 paused (1 run(s) still going)");
  expect(task.status).toBe("paused");
  await k.engine.report("w1.1-r1", "done", "the answer");
  await settle();
  expect(task.status).toBe("paused"); // the run ended, the task waits for the user
  expect(task.steps[0].status).toBe("done");

  expect(resume(k.engine, "w1")).toBe("w1 running");
  expect(task.status).toBe("done");

  const blocked = await makeEngine();
  await blocked.engine.submit(ask);
  await settle();
  await blocked.engine.report("w1.1-r1", "question", "which one?");
  expect(() => pause(blocked.engine, "w1")).toThrow(/w1 is blocked, not running/);
  expect(() => resume(k.engine, "w1")).toThrow(/no open task w1/);
});

test("stop ends active runs with the engine outcome, closes terminals, stops queued steps, keeps worktrees", async () => {
  const k = await makeEngine();
  const task = await k.engine.submit(ask);
  await settle();
  task.steps[0].branch = "wf/w1.1";
  task.steps[0].worktree = "/tmp/wt";

  const text = await stop(k.engine, "w1");
  expect(text).toContain("The user stopped the task.");
  expect(text).toContain("- w1.1 branch wf/w1.1 worktree /tmp/wt");
  expect(task.status).toBe("stopped");
  expect(task.closed).not.toBeNull();
  expect(task.steps[0].status).toBe("stopped");
  expect(task.steps[0].runs[0]).toMatchObject({ outcome: "stopped", summary: "The user stopped the task" });
  expect(k.host.closed).toEqual(["t1"]);
  expect(k.engine.active.size).toBe(0);
  expect(k.engine.tasks.has("w1")).toBe(false);
  expect(readFileSync(join(k.state, "runs/w1.1-r1/report.md"), "utf8")).toBe("The user stopped the task");
  expect(readFileSync(join(k.state, "runs/w1.1-r1/screen.txt"), "utf8")).toBe("screen of t1");
  expect(checkTask("w1.md", readDoc(new Store(k.brain, k.spec).path(task)).data, k.spec)).toEqual([]);
  await expect(stop(k.engine, "w1")).rejects.toThrow(/no open task w1/);
});

test("tell: running tasks get the message in every active terminal; other states are refused", async () => {
  const k = await makeEngine();
  await k.engine.submit(ask);
  await settle();

  const told = await tell(k.engine, "w1", "  look at src/build/ first  ");
  expect(told).toMatchObject({ wait: false, text: "sent to w1.1-r1 (t1)" });
  expect(k.host.sent.at(-1)).toEqual({ address: "t1", text: "Message from the user: look at src/build/ first" });

  pause(k.engine, "w1");
  await expect(tell(k.engine, "w1", "again")).rejects.toThrow(/w1 is paused, not running or awaiting approval/);
  await expect(tell(k.engine, "w1", "  ")).rejects.toThrow(/empty/);
});

test("tell: a plan waiting for approval is sent back to the planner", async () => {
  const dir = await repo();
  const runners = [fakeRunner("oc", ["s"], { models: [{ id: "s", tier: "small", cost: 0 }, { id: "m", tier: "medium", cost: 0 }] })];
  const k = await makeEngine({ runners });
  const task = await k.engine.submit({ command: "build", goal: "x", folder: dir, options: { check: "true" } });
  await until(() => [...k.engine.active.values()].some((a) => a.step.role === "plan" && a.run.terminal));
  const plan = [...k.engine.active.values()].find((a) => a.step.role === "plan")!;
  await k.engine.report(plan.run.id, "done", "step: a\nonly: src/a.txt\ncheck: true\n\nstep: b\nonly: src/b.txt\ncheck: true");
  expect(task.status).toBe("awaiting_approval");

  const told = await tell(k.engine, "w1", "do b first");
  expect(told.wait).toBe(true);
  expect(task.status).toBe("running");
  await until(() => k.host.spawned.at(-1)!.argv.at(-1)!.includes("The user wants your plan changed: do b first"));
});

test("take stops reconciliation until give back; limits count from the give-back time", async () => {
  const k = await makeEngine();
  await k.engine.submit(ask);
  await settle();
  k.host.set("t1", { status: { state: "working" } });
  await reconcile(k.engine);

  expect(take(k.engine, "w1.1")).toContain("terminal t1");
  const a = k.engine.active.get("w1.1-r1")!;
  expect(a.taken).toBe(true);

  // Taken: an idle run is not nudged and never times out, however long it sits.
  k.host.set("t1", { status: { state: "idle" } });
  k.clock.t += (NUDGE_SECONDS + 1) * 1000;
  await reconcile(k.engine);
  expect(k.host.sent).toEqual([]);
  expect(k.engine.active.size).toBe(1);

  // Time limits restart from the give-back, not from the run's start.
  const minutes = k.spec.policy.limits.run_minutes;
  k.clock.t += (minutes * 60 - 30) * 1000;
  await reconcile(k.engine);
  expect(k.engine.active.size).toBe(1);
  expect(giveBack(k.engine, "w1.1-r1")).toContain("time limits count from now");
  expect(a.limitsFrom).toBe(k.clock.t);
  k.clock.t += 60_000;
  await reconcile(k.engine);
  expect(k.engine.active.size).toBe(1);
  expect(k.logs.join("\n")).not.toContain("still working after");

  expect(() => take(k.engine, "w1")).toThrow(/take takes a step or run, not the task w1/);

  // The user may still finish it through the normal report path.
  await k.engine.report("w1.1-r1", "done", "the answer");
  expect(k.engine.tasks.size).toBe(0);
});

test("server: control ops answer over the socket and tell a running task without waiting", async () => {
  const k = await makeEngine();
  const path = join(mkdtempSync(join(tmpdir(), "wf-control-s-")), "wf.sock");
  const running = await serve(k.engine.d, path);
  await request({ op: "submit", submit: ask, wait: false }, path);
  await settle();

  expect((await request({ op: "status" }, path)).text).toContain("w1 ask running");
  expect((await request({ op: "show", what: "w1" }, path)).text).toContain("w1.1 [running]");
  expect((await request({ op: "pause", what: "w1" }, path)).text).toBe("w1 paused (1 run(s) still going)");
  expect((await request({ op: "resume", what: "w1" }, path)).text).toBe("w1 running");
  expect((await request({ op: "take", what: "w1.1" }, path)).text).toContain("terminal t1");
  expect((await request({ op: "giveback", what: "w1.1" }, path)).text).toContain("back with the engine");
  expect(await request({ op: "tell", task: "w1", text: "hello" }, path)).toEqual({
    ok: true,
    task: "w1",
    status: "running",
    text: "sent to w1.1-r1 (t1)",
  });
  expect((await request({ op: "stop", what: "w1" }, path)).text).toContain("The user stopped the task.");
  expect((await request({ op: "status" }, path)).text).toBe("no open tasks");
  await running.stop();
  await running.done;
});
