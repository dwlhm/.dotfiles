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

test("fork: a follow-up root task in the same folder whose agent forks the source session", async () => {
  await b.add({ title: "dark mode", brief: "add a toggle", cwd: "app", agent: "claude" });
  sys.as("t1");
  await expect(b.fork("T1", {})).rejects.toThrow("`board fork` is for the person");
  await b.report("done", "toggle added");
  sys.as(undefined);
  const f = await b.fork("T1", { brief: "also the settings page" });
  expect(f).toMatchObject({ id: "T2", parent: null, creator: "user", forked_from: "T1", title: "dark mode", cwd: "/repo/app", phase: "plan" });
  expect(f.assignee).toEqual({ agent: "claude", terminal: "t2", session: U(2) });
  const run = sys.calls.filter((c) => c[1] === "run").at(-1)!;
  expect(run.slice(run.indexOf("--") + 1, -1)).toEqual(["/bin/claude", "--resume", U(1), "--fork-session", "--session-id", U(2)]);
  expect(run.at(-1)).toContain("follows up on T1: dark mode (this session continues");
  expect((await b.store.get("T1")).log.at(-1)!.text).toBe("forked into T2: dark mode");
});

test("fork to another agent, or one that cannot fork, starts fresh with the source's report", async () => {
  await b.add({ title: "api", brief: "add /health", agent: "codex" });
  sys.as("t1");
  await b.report("done", "endpoint added", { detail: "**Changed**\n- routes.ts" });
  sys.as(undefined);
  await b.fork("T1", { title: "docs", agent: "opencode" });
  let run = sys.calls.filter((c) => c[1] === "run").at(-1)!;
  expect(run.slice(run.indexOf("--") + 1, -1)).toEqual(["/bin/opencode", "--session", expect.stringMatching(/^ses_board/), "--prompt"]);
  expect(run.at(-1)).toContain("follows up on T1: api\nIts last report: endpoint added\n\n**Changed**\n\n- routes.ts\nIts brief:\nadd /health");

  await b.fork("T1", { title: "tests" });
  run = sys.calls.filter((c) => c[1] === "run").at(-1)!;
  expect(run.slice(run.indexOf("--") + 1, -1)).toEqual(["/bin/codex", "fork", "--last"]);

  // Without an agent it waits in the backlog; assigning later still forks.
  const later = await main(["fork", "T1", "review", "--json"], sys).then(JSON.parse);
  expect(later).toMatchObject({ id: "T4", title: "review", forked_from: "T1", assignee: { agent: "codex" } });
  await b.add({ title: "plain" });
  expect((await b.fork("T5", {})).assignee).toBeNull();
  expect(await main(["show", "T6"], sys)).toContain("follows up on T5");
});
