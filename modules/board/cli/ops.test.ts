import { beforeEach, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./cli";
import { fakeSys, U } from "./fake";
import { Board } from "./ops";

let sys: ReturnType<typeof fakeSys>;
let b: Board;
beforeEach(async () => {
  sys = fakeSys(await mkdtemp(join(tmpdir(), "board-")));
  b = new Board(sys);
});
const sent = () => sys.calls.filter((c) => c[1] === "send").map((c) => [c[2], c[3]]);

test("the person adds a root task; assigning starts the agent with a session and labels", async () => {
  const t = await b.add({ title: "dark mode", brief: "add a toggle", agent: "claude" });
  expect(t).toMatchObject({ id: "T1", parent: null, creator: "user", phase: "plan", cwd: "/repo" });
  expect(t.assignee).toEqual({ agent: "claude", terminal: "t1", session: U(1) });
  const run = sys.calls.find((c) => c[1] === "run")!;
  expect(run).toContain("board.task=T1");
  expect(run).toContain("herdr.space=board");
  expect(run.slice(run.indexOf("--") + 1, -1)).toEqual(["/bin/claude", "--session-id", U(1)]);
  expect(run.at(-1)).toContain("board task T1: dark mode");
});

test("an agent cannot add a root task, only sub-tasks of its own; ids nest", async () => {
  await b.add({ title: "root", agent: "claude" });
  sys.as("t1");
  await expect(b.add({ title: "x" })).rejects.toThrow("make a sub-task");
  const s1 = await b.sub({ title: "ui", agent: "opencode" });
  const s2 = await b.sub({ title: "tokens" });
  expect([s1.id, s2.id]).toEqual(["T1.1", "T1.2"]);
  expect(s1).toMatchObject({ parent: "T1", creator: "T1", cwd: "/repo" });
  expect(s1.assignee!.session).toMatch(/^ses_board[0-9a-z]{21}$/);
  expect(s2.phase).toBe("backlog");
  expect((await b.store.get("T1")).log.map((e) => e.text)).toContain("made sub-task T1.1: ui");
});

test("a sub-task's report goes to its creator's live agent", async () => {
  await b.add({ title: "root", agent: "claude" });
  sys.as("t1");
  await b.sub({ title: "ui", agent: "agy" });
  sys.as("t2");
  const t = await b.report("done", "toggle added");
  expect(t.phase).toBe("done");
  expect(sent()).toEqual([["t1", "[board] T1.1 done: toggle added"]]);
});

test("done or failed ends the agent: the reporter after its turn, a card moved by the person at once", async () => {
  await b.add({ title: "root", agent: "claude" });
  sys.as("t1");
  await b.sub({ title: "ui", agent: "claude" });
  sys.as("t2");
  const t = await b.report("done", "toggle added");
  expect(t.assignee).toEqual({ agent: "claude", terminal: null, session: U(2) });
  expect(t.log.at(-1)!.text).toBe("done: agent ended");
  // The reporter is inside `board report`: hc ends it once its turn ends, from its own session.
  expect(sys.detached).toHaveLength(1);
  const { argv, env } = sys.detached[0];
  expect(argv.slice(0, 2)).toEqual(["sh", "-c"]);
  expect(argv.slice(3)).toEqual(["/bin/hc", "t2"]);
  expect(env.HC_TERMINAL_ID).toBeUndefined();
  expect(sys.calls.some((c) => c[1] === "kill")).toBe(false);

  sys.as(undefined);
  await b.phase("failed", "", "T1");
  expect(sys.live.has("t1")).toBe(false);
  expect((await b.store.get("T1")).assignee!.terminal).toBeNull();
  // An ended card's agent can still be resumed to look at it; moving it again ends nothing twice.
  expect((await b.open("T1")).assignee!.terminal).toBe("t3");
  await b.stop("T1");
  const kills = sys.calls.filter((c) => c[1] === "kill").length;
  await b.phase("done", "", "T1");
  expect(sys.calls.filter((c) => c[1] === "kill").length).toBe(kills);
});

test("a hand-back to an ended agent waits in its inbox and comes with the resume", async () => {
  await b.add({ title: "root", agent: "claude" });
  sys.as("t1");
  await b.sub({ title: "ui", agent: "claude" });
  sys.live.delete("t1");
  sys.as("t2");
  await b.report("question", "which colour?");
  const parent = await b.store.get("T1");
  expect(parent.inbox).toHaveLength(1);
  expect(parent.assignee!.terminal).toBeNull();
  expect((await b.store.get("T1.1"))).toMatchObject({ phase: "waiting", waiting_on: "T1" });

  sys.as(undefined);
  const opened = await b.open("T1");
  expect(opened.assignee!.terminal).toBe("t3");
  expect(opened.inbox).toEqual([]);
  const run = sys.calls.filter((c) => c[1] === "run").at(-1)!;
  expect(run.slice(run.indexOf("--") + 1)).toEqual(["/bin/claude", "--resume", U(1), "[board] T1.1 question: which colour?"]);
});

test("open leaves a live agent alone; answer resumes a waiting task", async () => {
  await b.add({ title: "root", agent: "claude" });
  expect((await b.open("T1")).assignee!.terminal).toBe("t1");
  expect(sys.calls.filter((c) => c[1] === "run")).toHaveLength(1);
  await b.phase("waiting", "", "T1");
  const t = await b.answer("T1", "use blue");
  expect(t).toMatchObject({ phase: "work", waiting_on: null });
  expect(sent()).toEqual([["t1", "[board] user answer: use blue"]]);
});

test("phases: agents set working phases on their own card, the person any phase on any card", async () => {
  await b.add({ title: "root", agent: "claude" });
  await expect(b.phase("review")).rejects.toThrow("agent working a board task");
  sys.as("t1");
  expect((await b.phase("review", "reading diff")).note).toBe("reading diff");
  await expect(b.phase("done")).rejects.toThrow("phase must be one of: plan, work, review, test");
  sys.as(undefined);
  expect((await b.phase("done", "", "T1")).phase).toBe("done");
  await expect(b.report("nope", "x")).rejects.toThrow("report must be one of");
});

test("assign refuses a task whose agent still runs; stop keeps the session", async () => {
  await b.add({ title: "root", agent: "claude" });
  await expect(b.assign("T1", "agy")).rejects.toThrow("already runs in t1");
  const t = await b.stop("T1");
  expect(t.assignee).toEqual({ agent: "claude", terminal: null, session: U(1) });
  expect(sys.live.has("t1")).toBe(false);
  await expect(b.assign("T1", "nobody")).rejects.toThrow('unknown agent "nobody"');
});

test("rm removes the task and its sub-tasks and stops their agents", async () => {
  await b.add({ title: "root", agent: "claude" });
  sys.as("t1");
  await b.sub({ title: "a", agent: "claude" });
  sys.as(undefined);
  await b.add({ title: "other" });
  expect(await b.remove("T1")).toEqual(["T1.1", "T1"]);
  expect((await b.store.list()).map((t) => t.id)).toEqual(["T2"]);
  expect(sys.live.size).toBe(0);
});

test("concurrent adds never share an id; ids sort numerically", async () => {
  await Promise.all(Array.from({ length: 12 }, (_, i) => b.add({ title: `t${i}` })));
  expect((await b.store.list()).map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => `T${i + 1}`));
});

test("cli: ls, show and phase by id; errors name the fix", async () => {
  await main(["add", "dark", "mode", "--brief", "b"], sys);
  expect(await main(["phase", "T1", "review", "looks", "ok"], sys)).toContain("review   -         dark mode — looks ok");
  expect(JSON.parse(await main(["ls", "--json"], sys))[0].id).toBe("T1");
  expect(await main(["show", "T1"], sys)).toContain("T1 [review] dark mode");
  await expect(main(["open", "T1"], sys)).rejects.toThrow("has no agent yet");
  await expect(main(["show", "T9"], sys)).rejects.toThrow("no task T9");
  await expect(main(["add"], sys)).rejects.toThrow('usage: board add "<title>"');
});

test("codex starts with its prompt and resumes its latest session in the folder", async () => {
  await b.add({ title: "root", agent: "codex" });
  const runs = () => sys.calls.filter((c) => c[1] === "run");
  expect(runs()[0].slice(runs()[0].indexOf("--") + 1, -1)).toEqual(["/bin/codex"]);
  await b.stop("T1");
  await b.open("T1");
  expect(runs().at(-1)!.slice(runs().at(-1)!.indexOf("--") + 1)).toEqual(["/bin/codex", "resume", "--last"]);
});

test("cli: values may start with a dash; folders must exist; agents are listed", async () => {
  await main(["add", "--cwd", "sub", "--brief", "- one\n- two", "--", "-x title"], sys);
  expect(await b.store.get("T1")).toMatchObject({ title: "-x title", brief: "- one\n- two", cwd: "/repo/sub" });
  await expect(main(["add", "y", "--cwd", "/missing"], sys)).rejects.toThrow("no such folder: /missing");
  expect((await main(["agents"], sys)).split("\n")).toEqual(["claude", "opencode", "agy", "codex"]);
});

test("a structured report keeps headline, detail and options until answered; the creator's agent reads it whole", async () => {
  await b.add({ title: "root", agent: "claude" });
  sys.as("t1");
  await b.sub({ title: "db", agent: "claude" });
  sys.as("t2");
  const t = await b.report("question", "SQLite or Postgres?", { detail: "**Context**\nOne user.", options: ["SQLite", "Postgres", "SQLite"] });
  expect(t.report).toEqual({ status: "question", headline: "SQLite or Postgres?", detail: "**Context**\n\nOne user.", options: ["SQLite", "Postgres"], at: expect.any(Number) });
  expect(t.note).toBe("SQLite or Postgres?");
  expect(sent()).toEqual([["t1", "[board] T1.1 question: SQLite or Postgres?\n\n**Context**\n\nOne user.\n\nOptions:\n1. SQLite (recommended)\n2. Postgres"]]);
  sys.as("t1");
  await expect(b.answer("T1.1", "  ")).rejects.toThrow("an answer needs text");
  expect((await b.answer("T1.1", "SQLite")).report).toBeNull();
});

test("the CLI takes --detail and repeated --option, even when they start with a dash", async () => {
  await b.add({ title: "root", agent: "claude" });
  sys.as("t1");
  const out = JSON.parse(await main(["report", "question", "Which one?", "--detail", "- a\n- b", "--option", "-a", "--option", "b", "--json"], sys));
  expect(out.report).toMatchObject({ headline: "Which one?", detail: "- a\n- b", options: ["-a", "b"] });
  expect(out.phase).toBe("waiting");
  sys.as(undefined);
  expect((await b.phase("work", "", "T1")).report).toBeNull();
});
