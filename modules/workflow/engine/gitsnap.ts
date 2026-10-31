// Commit given content for one path, exactly, without touching anything else the user staged.
// `git commit -- <path>` would take the working-tree file at the moment git runs, which a fast
// engine may already have rewritten; plumbing with a private index commits the snapshot itself.
import { join } from "node:path";
import { rmSync } from "node:fs";

type Out = { code: number; out: string; err: string };

async function git(root: string, args: string[], o: { env?: Record<string, string>; stdin?: string } = {}): Promise<Out> {
  const p = Bun.spawn(["git", "-C", root, ...args], {
    stdin: o.stdin === undefined ? "ignore" : new TextEncoder().encode(o.stdin),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...o.env },
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, out: out.trim(), err: err.trim() };
}

async function must(root: string, args: string[], o?: { env?: Record<string, string>; stdin?: string }): Promise<string> {
  const r = await git(root, args, o);
  if (r.code) throw new Error(`git ${args[0]}: ${r.err || r.out}`);
  return r.out;
}

/** One attempt; false when HEAD moved underneath (someone committed meanwhile). */
async function attempt(root: string, rel: string, blob: string, message: string): Promise<boolean | "same"> {
  const head = (await git(root, ["rev-parse", "--verify", "-q", "HEAD"])).out;
  if (head && (await git(root, ["rev-parse", "-q", "--verify", `HEAD:${rel}`])).out === blob) return "same";
  const index = join(root, ".git", `wf-index-${process.pid}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    await must(root, head ? ["read-tree", head] : ["read-tree", "--empty"], { env });
    await must(root, ["update-index", "--add", "--cacheinfo", `100644,${blob},${rel}`], { env });
    const tree = await must(root, ["write-tree"], { env });
    const commit = await must(root, ["commit-tree", tree, ...(head ? ["-p", head] : []), "-m", message]);
    const moved = await git(root, ["update-ref", "HEAD", commit, ...(head ? [head] : [])]);
    return moved.code === 0;
  } finally {
    rmSync(index, { force: true });
  }
}

/** Commit `content` as `rel` (relative to `root`). Returns false when it was already committed. */
export async function commitSnapshot(root: string, rel: string, content: string, message: string): Promise<boolean> {
  const blob = await must(root, ["hash-object", "-w", "--stdin"], { stdin: content });
  for (let i = 0; i < 3; i++) {
    const r = await attempt(root, rel, blob, message);
    if (r === "same") return false;
    if (r) {
      // Keep the user's index in step for this path only, so `git status` shows real changes.
      await must(root, ["update-index", "--add", "--cacheinfo", `100644,${blob},${rel}`]);
      return true;
    }
  }
  throw new Error("the brain's HEAD kept moving; will retry on the next milestone");
}
