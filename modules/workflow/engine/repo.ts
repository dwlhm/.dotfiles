// Git for patch work. Every write happens in worktrees wf owns under its state folder: the user's
// checkout, index and current branch are never touched. Nothing is forced: a worktree with
// changes is never removed and a branch is deleted only once it is merged.
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { exec, type Exec } from "./exec";

async function git(x: Exec, cwd: string, ...args: string[]): Promise<string> {
  const r = await x("git", ["-C", cwd, ...args], cwd);
  if (r.code) throw new Error(`git ${args[0]} failed: ${r.err || r.out.trim()}`);
  return r.out.trim();
}
const ok = async (x: Exec, cwd: string, ...args: string[]) => (await x("git", ["-C", cwd, ...args], cwd)).code === 0;

export async function repoRoot(folder: string, x: Exec = exec): Promise<string> {
  const r = await x("git", ["-C", folder, "rev-parse", "--show-toplevel"], folder);
  if (r.code) throw new Error(`${folder} is not in a git repository; patch work needs one`);
  return r.out.trim();
}

/**
 * Where new patch work starts: what the user has (HEAD) plus what wf already did and the user has
 * not merged yet (the integration branch), so the worker and the check see the repo as it will be.
 * HEAD alone when there is no integration branch; its tip when it already contains HEAD; else a
 * merge of both, made in the object store only (no checkout, index or ref changes). A conflict
 * between them is the user's to resolve first.
 */
export async function workBase(root: string, into: string, x: Exec = exec): Promise<string> {
  const head = (await x("git", ["-C", root, "rev-parse", "HEAD"], root)).out.trim();
  if (!head) throw new Error(`${root} has no commit yet; patch work starts from one`);
  const tip = await x("git", ["-C", root, "rev-parse", "--verify", "-q", `refs/heads/${into}`], root);
  if (tip.code) return head;
  if (await ok(x, root, "merge-base", "--is-ancestor", "HEAD", into)) return tip.out.trim();
  if (await ok(x, root, "merge-base", "--is-ancestor", into, "HEAD")) return head;
  const tree = await x("git", ["-C", root, "merge-tree", "--write-tree", "--name-only", into, "HEAD"], root);
  if (tree.code) {
    const files = tree.out.trim().split("\n").slice(1).filter((l) => l && !l.includes(" ")).join(", ");
    throw new Error(`your branch and ${into} conflict (${files || "see git merge-tree"}); merge ${into} into your branch first`);
  }
  return git(x, root, "commit-tree", tree.out.trim().split("\n")[0], "-p", tip.out.trim(), "-p", head, "-m", `wf: base = ${into} + your HEAD`);
}

/** `<state>/worktrees/<repo>-<hash>/`: one folder per repository, named so a person can find it. */
export const repoDir = (state: string, root: string) =>
  join(state, "worktrees", `${basename(root)}-${createHash("sha1").update(root).digest("hex").slice(0, 8)}`);

/**
 * `name`, or `name-2`, `name-3`… when taken: task ids are unique per brain, branches per repo, so
 * a branch kept from another wf state (or by hand) must never be reused for different work.
 */
export async function freeBranch(root: string, name: string, x: Exec = exec): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${name}-${n}`;
    if (!(await ok(x, root, "rev-parse", "--verify", "-q", `refs/heads/${candidate}`))) return candidate;
  }
}

/**
 * The step's worktree on its own branch from `base`. An existing one is reused as it is (a retry,
 * a restarted engine), but only when it really is that worktree: anything else at the path is
 * never worked in.
 */
export async function stepWorktree(root: string, path: string, branch: string, base: string, x: Exec = exec): Promise<void> {
  if (!existsSync(path)) return void (await git(x, root, "worktree", "add", "-q", "-b", branch, path, base));
  const on = await x("git", ["-C", path, "rev-parse", "--abbrev-ref", "HEAD"], root);
  const top = await x("git", ["-C", path, "rev-parse", "--show-toplevel"], root);
  if (on.code || on.out.trim() !== branch || top.out.trim() !== realpathSync(path)) {
    throw new Error(`${path} exists but is not the ${branch} worktree; move it away`);
  }
}

/** Paths changed in a worktree (staged, unstaged, untracked; both sides of a rename). */
export async function changed(wt: string, x: Exec = exec): Promise<string[]> {
  // Raw output: each line starts with a two-letter status that may begin with a space.
  const r = await x("git", ["-C", wt, "status", "--porcelain=v1", "-uall"], wt);
  if (r.code) throw new Error(`git status failed: ${r.err}`);
  return r.out.split("\n").filter(Boolean).flatMap((l) => l.slice(3).split(" -> ")).map((p) => p.replace(/^"|"$/g, ""));
}

/** Changed paths outside `only` (repo-relative globs, or plain files/folders; empty = anywhere). */
export function outside(paths: string[], only: string[]): string[] {
  if (!only.length) return [];
  const inside = (p: string, o: string) => {
    if (/[*?[{]/.test(o)) return new Bun.Glob(o).match(p);
    const dir = o.replace(/^\.\//, "").replace(/\/$/, "");
    return dir === "" || dir === "." || p === dir || p.startsWith(`${dir}/`);
  };
  return paths.filter((p) => !only.some((o) => inside(p, o)));
}

/** Commit everything in the worktree; the new commit, or null when nothing changed. */
export async function commitAll(wt: string, message: string, x: Exec = exec): Promise<string | null> {
  await git(x, wt, "add", "-A");
  if (await ok(x, wt, "diff", "--cached", "--quiet")) return null;
  await git(x, wt, "commit", "-q", "-m", message);
  return git(x, wt, "rev-parse", "--short", "HEAD");
}

/** A branch's tip commit. */
export const tip = (root: string, branch: string, x: Exec = exec) => git(x, root, "rev-parse", `refs/heads/${branch}`);

export const diffSince = (wt: string, base: string, x: Exec = exec) => git(x, wt, "diff", `${base}..HEAD`);

/** The worktree a branch is checked out in, if any (after dropping entries whose folder is gone). */
async function checkedOut(root: string, branch: string, x: Exec): Promise<string | null> {
  await git(x, root, "worktree", "prune");
  let path: string | null = null;
  for (const line of (await git(x, root, "worktree", "list", "--porcelain")).split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice(9);
    else if (line === `branch refs/heads/${branch}`) return path;
  }
  return null;
}

/**
 * The integration branch's worktree, creating the branch from `base` the first time. A branch can
 * be checked out only once, so a worktree that already has it (another wf state, or the user's)
 * is used as it is when clean; the returned path is the one to merge in.
 */
export async function integration(root: string, path: string, branch: string, base: string, x: Exec = exec): Promise<string> {
  const existing = await checkedOut(root, branch, x);
  if (existing) {
    if ((await changed(existing, x)).length) throw new Error(`${branch} is checked out with uncommitted changes in ${existing}; commit or clean them first`);
    return existing;
  }
  if (!(await ok(x, root, "rev-parse", "--verify", "-q", `refs/heads/${branch}`))) await git(x, root, "branch", branch, base);
  await git(x, root, "worktree", "add", "-q", path, branch);
  return path;
}

/** Merge `branch` into the integration worktree; on conflict abort and name the files. */
export async function mergeInto(intWt: string, branch: string, message: string, x: Exec = exec): Promise<{ commit: string } | { conflicts: string[] }> {
  if (await ok(x, intWt, "merge", "--no-ff", "-q", "-m", message, branch)) return { commit: await git(x, intWt, "rev-parse", "--short", "HEAD") };
  const files = (await x("git", ["-C", intWt, "diff", "--name-only", "--diff-filter=U"], intWt)).out.trim().split("\n").filter(Boolean);
  await x("git", ["-C", intWt, "merge", "--abort"], intWt);
  return { conflicts: files };
}

/** What `wf merge` did: the merge commit, or the files that conflicted (the merge was aborted). */
export type UserMerge = { commit: string } | { conflicts: string[] };

/**
 * `wf merge`: merge `branch` into the user's current branch. Only a clean checkout is touched, and
 * a conflict is aborted so the user's branch and index are left exactly as they were.
 */
export async function mergeUserBranch(root: string, branch: string, x: Exec = exec): Promise<UserMerge> {
  const status = await x("git", ["-C", root, "status", "--porcelain=v1", "-uall"], root);
  if (status.code) throw new Error(`git status failed: ${status.err || status.out.trim()}`);
  if (status.out.trim()) throw new Error("your working tree has uncommitted changes; commit or stash them first");
  if ((await x("git", ["-C", root, "rev-parse", "--verify", "-q", "HEAD"], root)).code) throw new Error("this repository has no commit yet");
  if ((await x("git", ["-C", root, "rev-parse", "--verify", "-q", `refs/heads/${branch}`], root)).code) throw new Error(`there is no ${branch} branch: nothing from wf to merge`);
  if (await ok(x, root, "merge-base", "--is-ancestor", branch, "HEAD")) throw new Error(`${branch} has nothing new for your branch`);
  if (await ok(x, root, "merge", "--no-ff", "-m", `Merge ${branch}`, branch)) return { commit: await git(x, root, "rev-parse", "--short", "HEAD") };
  const files = (await x("git", ["-C", root, "diff", "--name-only", "--diff-filter=U"], root)).out.trim().split("\n").filter(Boolean);
  await x("git", ["-C", root, "merge", "--abort"], root);
  return { conflicts: files };
}

/** A split step's own worktree and branch: removed when they hold nothing (clean, no commits). */
export async function dropIfEmpty(root: string, wt: string, branch: string, base: string, x: Exec = exec): Promise<void> {
  if (existsSync(wt) && !(await changed(wt, x)).length) await git(x, root, "worktree", "remove", wt);
  if ((await x("git", ["-C", root, "rev-list", "--count", `${base}..${branch}`], root)).out.trim() === "0") await git(x, root, "branch", "-D", branch);
}

/** Remove a clean step worktree, and its branch once `into` contains it. */
export async function cleanup(root: string, wt: string, branch: string, into: string | null, x: Exec = exec): Promise<void> {
  if (existsSync(wt) && !(await changed(wt, x)).length) await git(x, root, "worktree", "remove", wt);
  if (into && (await ok(x, root, "merge-base", "--is-ancestor", branch, into))) await git(x, root, "branch", "-D", branch);
}
