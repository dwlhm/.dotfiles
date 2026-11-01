import { beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeSys } from "./fake";
import { Board } from "./ops";

let sys: ReturnType<typeof fakeSys>;
let b: Board;
let repo: string;

const git = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", "-C", cwd, "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
};
const commit = (cwd: string, file: string, text: string) => {
  writeFileSync(join(cwd, file), text);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", `feat: ${file}`);
  return git(cwd, "rev-parse", "HEAD");
};
const spawned = () => sys.calls.filter((c) => c[1] === "run").at(-1)!;

beforeEach(async () => {
  const root = realpathSync(await mkdtemp(join(tmpdir(), "board-wt-")));
  repo = join(root, "repo");
  mkdirSync(join(repo, "app"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  commit(repo, "a.txt", "a");
  sys = fakeSys(join(root, "state"));
  b = new Board(sys);
});

test("a task in git works in its own worktree and branch; the person lands its commits", async () => {
  const t = await b.add({ title: "dark mode", cwd: join(repo, "app"), agent: "claude" });
  const w = t.worktree!;
  expect(w).toMatchObject({ top: repo, target: repo, branch: "board/t1", sub: "app" });
  expect(w.path).toBe(join(sys.env.BOARD_STATE!, "worktrees", `repo-${w.path.split("repo-")[1].split("/")[0]}`, "t1"));
  const run = spawned();
  expect(run[run.indexOf("--cwd") + 1]).toBe(join(w.path, "app"));
  expect(run.at(-1)).toContain(`your own git worktree ${w.path} on branch board/t1`);

  sys.as("t1");
  writeFileSync(join(w.path, "b.txt"), "b");
  await expect(b.report("done", "toggle")).rejects.toThrow("commit or drop your changes");
  git(w.path, "add", "b.txt");
  git(w.path, "commit", "-q", "-m", "feat: b");
  const theirs = commit(repo, "c.txt", "c");
  await expect(b.report("done", "toggle")).rejects.toThrow(`git rebase ${theirs}`);
  git(w.path, "rebase", "-q", theirs);

  const waiting = await b.report("done", "toggle");
  expect(waiting).toMatchObject({ phase: "waiting", waiting_on: "user", report: { status: "done" } });
  expect(waiting.commits.map((c) => c.subject)).toEqual(["feat: b"]);
  expect(sys.detached).toHaveLength(0);

  sys.as(undefined);
  await expect(b.phase("done", "", "T1")).rejects.toThrow("board land T1");
  const done = await b.land("T1");
  expect(done.phase).toBe("done");
  expect(git(repo, "log", "-1", "--format=%s")).toBe("feat: b");
  expect(existsSync(w.path)).toBe(false);
  expect(git(repo, "branch", "--list", "board/*")).toBe("");
  expect(sys.live.has("t1")).toBe(false);
  await expect(b.open("T1")).rejects.toThrow("board fork T1");
});

test("land sends the agent back when the target moved, and refuses over uncommitted edits there", async () => {
  const t = await b.add({ title: "x", cwd: repo, agent: "codex" });
  sys.as("t1");
  commit(t.worktree!.path, "a.txt", "mine");
  await b.report("done", "x");
  sys.as(undefined);
  writeFileSync(join(repo, "a.txt"), "edit in progress");
  await expect(b.land("T1")).rejects.toThrow("uncommitted edits there");
  expect((await b.store.get("T1")).phase).toBe("waiting");
  git(repo, "checkout", "a.txt");
  const head = commit(repo, "d.txt", "d");
  const back = await b.land("T1");
  expect(back).toMatchObject({ phase: "work", report: null });
  expect(sys.calls.find((c) => c[1] === "send")![3]).toContain(`[board] user land: ${repo} moved on: rebase onto ${head}`);
});

test("auto-land puts the commits on the branch at once; a sub-task lands in its parent's worktree", async () => {
  const t = await b.add({ title: "root", cwd: repo, agent: "claude", auto_land: true });
  sys.as("t1");
  const s = await b.sub({ title: "ui", agent: "claude" });
  expect(s.worktree).toMatchObject({ target: t.worktree!.path, branch: "board/t1-1" });
  sys.as("t2");
  commit(s.worktree!.path, "ui.txt", "ui");
  expect((await b.report("done", "ui")).phase).toBe("done");
  expect(git(t.worktree!.path, "log", "-1", "--format=%s")).toBe("feat: ui.txt");
  expect(existsSync(s.worktree!.path)).toBe(false);

  sys.as("t1");
  const done = await b.report("done", "root");
  expect(done.phase).toBe("done");
  expect(done.commits.map((c) => c.subject)).toEqual(["feat: ui.txt"]);
  expect(git(repo, "log", "-1", "--format=%s")).toBe("feat: ui.txt");
});

test("failed drops the worktree; rm needs --force over unlanded work; a follow-up reuses the folder", async () => {
  const t = await b.add({ title: "a", cwd: repo, agent: "claude" });
  commit(t.worktree!.path, "x.txt", "x");
  await expect(b.remove("T1")).rejects.toThrow("board rm T1 --force");
  await b.phase("failed", "", "T1");
  expect(existsSync(t.worktree!.path)).toBe(false);

  const f = await b.fork("T1", {});
  expect(f.worktree!.path).toBe(t.worktree!.path);
  expect(f.worktree!.branch).toBe("board/t2");
  const again = await b.fork("T1", { title: "second" });
  expect(again.worktree!.path).toBe(t.worktree!.path.replace(/t1$/, "t3"));

  commit(f.worktree!.path, "y.txt", "y");
  expect(await b.remove("T2", true)).toEqual(["T2"]);
  expect(existsSync(f.worktree!.path)).toBe(false);
});

test("a folder outside git runs in place", async () => {
  const plain = realpathSync(await mkdtemp(join(tmpdir(), "board-plain-")));
  const t = await b.add({ title: "notes", cwd: plain, agent: "claude" });
  expect(t.worktree).toBeNull();
  expect(spawned()[spawned().indexOf("--cwd") + 1]).toBe(plain);
});
