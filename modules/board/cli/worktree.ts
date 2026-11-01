// Git worktrees for board tasks. A task whose folder is in git works in its own worktree on branch
// `board/<id>`, started from the HEAD of the checkout it lands into: the person's checkout for a
// root task, its parent's worktree for a sub-task. Its commits land there by fast-forward only,
// once its agent rebased them; then the worktree and its branch go.
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { Task } from "./store";
import { stateDir, type Sys } from "./sys";

export interface Worktree {
  /** Top of the person's checkout the task's folder is in. */
  top: string;
  /** The checkout the task's commits land into. */
  target: string;
  /** The task's own checkout; gone once the task ended. */
  path: string;
  branch: string;
  /** The task's folder inside the checkout ("" for its top). */
  sub: string;
}

export interface Commit { sha: string; subject: string }

/** Where a task's worktree stands against its target. */
export interface Readiness {
  /** The target's HEAD now. */
  head: string;
  /** Uncommitted paths in the worktree. */
  dirty: string[];
  /** The target's HEAD is not under the branch: the agent has to rebase. */
  behind: boolean;
  /** Commits on the branch that the target lacks, oldest first. */
  commits: Commit[];
}

/** Where the task's agent works: its worktree, or its folder outside git. */
export const workdir = (t: Task) => (t.worktree ? join(t.worktree.path, t.worktree.sub) : t.cwd);

const slug = (id: string) => id.toLowerCase().replaceAll(".", "-");

export class Git {
  constructor(private sys: Sys) {}

  private async git(cwd: string, args: string[]): Promise<string> {
    const r = await this.sys.run(["git", "-C", cwd, ...args]);
    if (r.code !== 0) throw new Error(`git ${args[0]} failed in ${cwd}: ${(r.err || r.out).trim()}`);
    return r.out.trim();
  }

  private async ok(cwd: string, args: string[]): Promise<boolean> {
    return (await this.sys.run(["git", "-C", cwd, ...args])).code === 0;
  }

  exists = (w: Worktree) => existsSync(w.path);

  /** Top of the checkout holding `dir`, or null when it is not in git. */
  async top(dir: string): Promise<string | null> {
    if (!existsSync(dir)) return null;
    const r = await this.sys.run(["git", "-C", dir, "rev-parse", "--show-toplevel"]);
    return r.code === 0 ? r.out.trim() : null;
  }

  /** The task's worktree: its own while it exists, else a new one (in its old folder, or for a
   *  follow-up in its source's, so the agent's session is found there), or null outside git. */
  async checkout(task: Task, all: Task[]): Promise<Worktree | null> {
    if (task.worktree && this.exists(task.worktree)) return task.worktree;
    const top = await this.top(task.cwd);
    if (!top) return null;
    const pw = all.find((t) => t.id === task.parent)?.worktree;
    const target = pw && this.exists(pw) && pw.top === top ? pw.path : top;
    const prefer = task.worktree?.path ?? all.find((t) => t.id === task.forked_from)?.worktree?.path;
    return this.create(task.id, top, relative(top, realpathSync(task.cwd)), target, prefer);
  }

  /** The commits an agent's `report done` hands over; refuses (for the agent to fix) while the
   *  worktree has uncommitted changes or does not sit on the target's HEAD. */
  async ready(w: Worktree): Promise<Commit[]> {
    const r = await this.readiness(w);
    if (r.dirty.length) throw new Error(`commit or drop your changes in ${w.path} first: ${r.dirty.join(", ")}`);
    if (r.behind) throw new Error(`${w.target} moved on: rebase onto it (\`git rebase ${r.head}\`), rerun the checks, then report done again`);
    return r.commits;
  }

  /** A new worktree for task `id` from `target`'s HEAD, at `prefer` when that folder is free
   *  (a resumed or followed-up session is found by its folder). */
  async create(id: string, top: string, sub: string, target: string, prefer?: string): Promise<Worktree> {
    const home = join(stateDir(this.sys.env), "worktrees", `${basename(top)}-${createHash("sha1").update(top).digest("hex").slice(0, 8)}`);
    const path = prefer && !existsSync(prefer) ? prefer : free(join(home, slug(id)), existsSync);
    let branch = `board/${slug(id)}`;
    for (let i = 2; await this.ok(top, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]); i++) branch = `board/${slug(id)}-${i}`;
    const base = await this.git(target, ["rev-parse", "HEAD"]);
    await this.git(top, ["worktree", "add", "--quiet", "-b", branch, path, base]);
    return { top, target, path, branch, sub };
  }

  async readiness(w: Worktree): Promise<Readiness> {
    const head = await this.git(w.target, ["rev-parse", "HEAD"]);
    const dirty = (await this.git(w.path, ["status", "--porcelain"])).split("\n").filter(Boolean).map((l) => l.slice(3));
    const behind = !(await this.ok(w.path, ["merge-base", "--is-ancestor", head, w.branch]));
    const log = await this.git(w.path, ["log", "--reverse", "--format=%H%x09%s", `${head}..${w.branch}`]);
    const commits = log.split("\n").filter(Boolean).map((l) => ({ sha: l.slice(0, 40), subject: l.slice(41) }));
    return { head, dirty, behind, commits };
  }

  /** The worktree holds commits or changes nobody landed. */
  async unlanded(w: Worktree | null): Promise<boolean> {
    if (!w || !this.exists(w)) return false;
    const r = await this.readiness(w);
    return r.commits.length > 0 || r.dirty.length > 0;
  }

  /** Puts the branch's commits on the target's branch; git refuses when they touch files with
   *  uncommitted edits there. */
  async land(w: Worktree) {
    const r = await this.sys.run(["git", "-C", w.target, "merge", "--ff-only", "--quiet", w.branch]);
    if (r.code !== 0) throw new Error(`${w.branch} does not land on ${w.target}: ${(r.err || r.out).trim()}\nIts commits touch files with uncommitted edits there: wait until they are committed and try again, or report stuck with the files.`);
  }

  /** Drops the worktree (with any changes in it) and its branch. */
  async remove(w: Worktree) {
    if (this.exists(w)) await this.git(w.top, ["worktree", "remove", "--force", w.path]);
    await this.ok(w.top, ["branch", "-D", w.branch]);
  }
}

function free(path: string, taken: (p: string) => boolean): string {
  let p = path;
  for (let i = 2; taken(p); i++) p = `${path}-${i}`;
  return p;
}
