import { test, expect, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSpec } from "./spec";
import { main, specDir } from "./cli";
import { Store } from "./store";
import { control, merge, show, status, tell, watch, type Ask } from "./control-cli";
import type { Task } from "./records";

const spec = loadSpec(specDir());

const sh = async (dir: string, ...a: string[]) => {
  const p = Bun.spawn(["git", "-C", dir, ...a], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  return { code, out: out.trim(), err: err.trim() };
};

const gitOk = async (dir: string, ...a: string[]) => {
  const r = await sh(dir, ...a);
  if (r.code) throw new Error(r.err || r.out);
  return r.out;
};

/** A repo with one commit on `main` and a file to change. */
async function repo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "wf-cli-"));
  for (const a of [["init", "-q", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]]) await gitOk(dir, ...a);
  writeFileSync(join(dir, "a.txt"), "a0\n");
  await gitOk(dir, "add", "-A");
  await gitOk(dir, "commit", "-qm", "init");
  return dir;
}

/** An open task record with one step and one run, ready for the store. */
function record(run: Partial<Task["steps"][number]["runs"][number]> = {}): Task {
  return {
    id: "w1",
    command: "ask",
    goal: "why is the build slow?",
    folder: "/tmp",
    options: {},
    status: "running",
    created: "2026-10-31T17:00:00Z",
    closed: null,
    answers: [],
    steps: [
      {
        id: "w1.1",
        title: "why is the build slow?",
        role: "research",
        only: [],
        deps: [],
        status: "running",
        runs: [{ id: "w1.1-r1", runner: "oc", model: "m1", terminal: "t1", started: "2026-10-31T17:00:00Z", ended: null, outcome: null, ...run }],
        steps: [],
      },
    ],
  };
}

test("status, show, pause, resume, stop, take and give back ask the engine for one op", async () => {
  const seen: object[] = [];
  const ask: Ask = async (req) => {
    seen.push(req);
    return { ok: true, text: "engine text" };
  };

  expect(await status(ask)).toEqual({ code: 0, out: "engine text" });
  expect(await show("w1.1", ask)).toEqual({ code: 0, out: "engine text" });
  expect(await control("pause", "w1", ask)).toEqual({ code: 0, out: "engine text" });
  expect(await control("resume", "w1", ask)).toEqual({ code: 0, out: "engine text" });
  expect(await control("stop", "w1", ask)).toEqual({ code: 0, out: "engine text" });
  expect(await control("take", "w1.1-r1", ask)).toEqual({ code: 0, out: "engine text" });
  expect(await control("giveback", "w1.1-r1", ask)).toEqual({ code: 0, out: "engine text" });

  expect(seen).toEqual([
    { op: "status" },
    { op: "show", what: "w1.1" },
    { op: "pause", what: "w1" },
    { op: "resume", what: "w1" },
    { op: "stop", what: "w1" },
    { op: "take", what: "w1.1-r1" },
    { op: "giveback", what: "w1.1-r1" },
  ]);
});

test("a refusal keeps the engine's reason under the command the user typed", async () => {
  const ask: Ask = async () => ({ ok: false, error: "w1 is paused, not running" });
  expect(await control("pause", "w1", ask)).toEqual({ code: 1, err: "wf pause: w1 is paused, not running" });
  expect(await control("giveback", "w1", ask)).toEqual({ code: 1, err: "wf give back: w1 is paused, not running" });
  expect(await show("nope", ask)).toEqual({ code: 1, err: "wf show: w1 is paused, not running" });
});

test("a control command without what is a usage error", async () => {
  const ask: Ask = async () => ({ ok: true });
  await expect(show(undefined, ask)).rejects.toThrow(/usage: wf show/);
  await expect(control("pause", undefined, ask)).rejects.toThrow(/usage: wf pause/);
  await expect(control("giveback", "", ask)).rejects.toThrow(/usage: wf give back/);
});

test("tell sends the untrimmed words once, and a waiting plan's status is the exit code", async () => {
  const seen: object[] = [];
  const waiting: Ask = async (req) => {
    seen.push(req);
    return { ok: true, task: "w1", status: "awaiting_approval", text: "w1 plan sent back" };
  };
  expect(await tell("w1", "  do b first  ", waiting)).toEqual({ code: 3, out: "w1 awaiting_approval\n\nw1 plan sent back" });
  expect(seen).toEqual([{ op: "tell", task: "w1", text: "do b first" }]);

  const running: Ask = async () => ({ ok: true, task: "w1", status: "running", text: "sent to w1.1-r1 (t1)" });
  expect(await tell("w1", "hello", running)).toEqual({ code: 0, out: "w1 running\n\nsent to w1.1-r1 (t1)" });

  const refused: Ask = async () => ({ ok: false, error: "w1 is paused" });
  expect(await tell("w1", "hello", refused)).toEqual({ code: 1, err: "wf tell: w1 is paused" });
  await expect(tell("w1", "   ", running)).rejects.toThrow(/usage: wf tell/);
});

test("watch attaches an active run's terminal; a task watches its latest active run", async () => {
  const brain = mkdtempSync(join(tmpdir(), "wf-watch-brain-"));
  const state = mkdtempSync(join(tmpdir(), "wf-watch-state-"));
  new Store(brain, spec).save(record());

  const attached: string[] = [];
  const o = { brain, state, attach: async (address: string) => (attached.push(address), 0) };
  expect(await watch(spec, "w1.1", o)).toEqual({ code: 0 });
  expect(await watch(spec, "w1", o)).toEqual({ code: 0 }); // a task watches its latest active run
  expect(attached).toEqual(["t1", "t1"]);
});

test("watch prints an ended run's saved screen instead of attaching", async () => {
  const brain = mkdtempSync(join(tmpdir(), "wf-watch-brain-"));
  const state = mkdtempSync(join(tmpdir(), "wf-watch-state-"));
  new Store(brain, spec).save(record({ ended: "2026-10-31T17:05:00Z", outcome: "done", summary: "the answer" }));
  mkdirSync(join(state, "runs", "w1.1-r1"), { recursive: true });
  writeFileSync(join(state, "runs", "w1.1-r1", "screen.txt"), "the last screen\n");

  const attached: string[] = [];
  const r = await watch(spec, "w1.1-r1", { brain, state, attach: async (address: string) => (attached.push(address), 0) });
  expect(r).toEqual({ code: 0, out: "the last screen" });
  expect(attached).toEqual([]);
});

test("watch names what it cannot watch", async () => {
  const brain = mkdtempSync(join(tmpdir(), "wf-watch-brain-"));
  const state = mkdtempSync(join(tmpdir(), "wf-watch-state-"));
  new Store(brain, spec).save(record({ ended: "2026-10-31T17:05:00Z", outcome: "done" }));

  const ask = { brain, state, attach: async () => 0 };
  expect(await watch(spec, "nope", ask)).toEqual({ code: 1, err: "wf watch: nothing matches 'nope' (open: w1: why is the build slow?)" });
  expect((await watch(spec, "w1.1-r1", ask)).err).toContain("its screen was not saved");
  await expect(watch(spec, undefined, ask)).rejects.toThrow(/usage: wf watch/);
});

test("merge: a clean checkout merges wf/integration with --no-ff", async () => {
  const dir = await repo();
  await gitOk(dir, "checkout", "-q", "-b", "wf/integration");
  writeFileSync(join(dir, "a.txt"), "a1\n");
  await gitOk(dir, "commit", "-qam", "wf work");
  await gitOk(dir, "checkout", "-q", "main");

  const r = await merge(spec, ["in", dir]);
  expect(r.code).toBe(0);
  expect(r.out).toMatch(/^merged wf\/integration \([0-9a-f]+\)$/);
  expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("a1\n");
  expect(await gitOk(dir, "log", "-1", "--pretty=%s")).toBe("Merge wf/integration");
  expect(await gitOk(dir, "rev-list", "--parents", "-n", "1", "HEAD")).toMatch(/^[0-9a-f]+ [0-9a-f]+ [0-9a-f]+$/);
});

test("merge refuses a dirty working tree, a missing integration branch and nothing new", async () => {
  const dirty = await repo();
  await gitOk(dirty, "branch", "wf/integration");
  writeFileSync(join(dirty, "a.txt"), "dirty\n");
  const refused = await merge(spec, ["in", dirty]);
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("uncommitted changes");
  expect(await gitOk(dirty, "status", "--porcelain")).toBe("M a.txt");

  const missing = await repo();
  expect((await merge(spec, ["in", missing])).err).toContain("there is no wf/integration branch");

  const nothing = await repo();
  await gitOk(nothing, "branch", "wf/integration");
  expect((await merge(spec, ["in", nothing])).err).toContain("has nothing new");
});

test("merge aborts a conflict, lists the files and leaves the branch as it was", async () => {
  const dir = await repo();
  await gitOk(dir, "checkout", "-q", "-b", "wf/integration");
  writeFileSync(join(dir, "a.txt"), "integration\n");
  await gitOk(dir, "commit", "-qam", "wf work");
  await gitOk(dir, "checkout", "-q", "main");
  writeFileSync(join(dir, "a.txt"), "mine\n");
  await gitOk(dir, "commit", "-qam", "my work");
  const before = await gitOk(dir, "rev-parse", "HEAD");

  const r = await merge(spec, ["in", dir]);
  expect(r.code).toBe(1);
  expect(r.err).toContain("conflicts");
  expect(r.err).toContain("a.txt");
  expect(r.err).toContain("aborted");
  expect(await gitOk(dir, "rev-parse", "HEAD")).toBe(before);
  expect(await gitOk(dir, "status", "--porcelain")).toBe("");
});

test("merge takes `in <folder>` only", async () => {
  await expect(merge(spec, ["in"])).rejects.toThrow(/usage: wf merge/);
  await expect(merge(spec, ["somewhere"])).rejects.toThrow(/usage: wf merge/);
});

test("main wires watch and merge (no engine needed) and keeps usage errors at exit 2", async () => {
  const dir = await repo();
  await gitOk(dir, "checkout", "-q", "-b", "wf/integration");
  writeFileSync(join(dir, "a.txt"), "a1\n");
  await gitOk(dir, "commit", "-qam", "wf work");
  await gitOk(dir, "checkout", "-q", "main");

  const brain = mkdtempSync(join(tmpdir(), "wf-watch-brain-"));
  const state = mkdtempSync(join(tmpdir(), "wf-watch-state-"));
  new Store(brain, spec).save(record({ ended: "2026-10-31T17:05:00Z", outcome: "done" }));
  mkdirSync(join(state, "runs", "w1.1-r1"), { recursive: true });
  writeFileSync(join(state, "runs", "w1.1-r1", "screen.txt"), "the last screen\n");

  const saved = { brain: process.env.WF_BRAIN, state: process.env.WF_STATE };
  const out: string[] = [];
  const log = spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  const err = spyOn(console, "error").mockImplementation(() => {});
  process.env.WF_BRAIN = brain;
  process.env.WF_STATE = state;
  try {
    expect(await main(["watch", "w1.1-r1"])).toBe(0);
    expect(await main(["merge", "in", dir])).toBe(0);
    expect(out).toContain("the last screen");
    expect(out.join("\n")).toContain("merged wf/integration");
    expect(await main(["show"])).toBe(2);
    expect(await main(["give", "w1"])).toBe(2);
  } finally {
    log.mockRestore();
    err.mockRestore();
    if (saved.brain === undefined) delete process.env.WF_BRAIN;
    else process.env.WF_BRAIN = saved.brain;
    if (saved.state === undefined) delete process.env.WF_STATE;
    else process.env.WF_STATE = saved.state;
  }
});
