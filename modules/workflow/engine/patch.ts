// Patch steps (roles that edit): preparing the repo, base and check at submit, the folder a run
// works in, and the engine's own landing of the result (engine/land.ts).
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import type { Spec } from "./spec";
import type { Step, Task } from "./records";
import type { Submit } from "./engine";
import type { Exec } from "./exec";
import { edits } from "./plans";
import { freeBranch, repoDir, repoRoot, stepWorktree, workBase } from "./repo";
import { chooseCheck } from "./checks";
import { land, type Landed } from "./land";

export type Patch = { root: string; base: string; check: string; only: string[] };

/**
 * Patch work needs a repo, a base commit and a check (guessed only when unambiguous, else the user
 * is asked to name it). `only` paths are made relative to the repo root.
 */
export async function preparePatch(spec: Spec, s: Submit, x?: Exec): Promise<Patch> {
  const root = await repoRoot(s.folder, x);
  const base = await workBase(root, spec.policy.integration_branch, x);
  const chosen = chooseCheck(root, s.options.check as string | undefined);
  if ("ask" in chosen) throw new Error(chosen.ask);
  // git reports the canonical root (/private/var/…, resolved symlinks): compare like with like.
  const prefix = relative(root, realpathSync(s.folder));
  const only = ((s.options.only as string[] | undefined) ?? []).map((o) => join(prefix, o.replace(/^\.\//, "")).replace(/\/$/, "") || ".");
  return { root, base, check: chosen.check, only };
}

/** Give every editing step its paths, check, a free branch and its worktree folder. */
export async function assignPatch(spec: Spec, steps: Step[], p: Patch, state: string, x?: Exec): Promise<void> {
  for (const step of steps.filter((s) => edits(spec, s.role))) {
    const branch = await freeBranch(p.root, `wf/${step.id}`, x);
    Object.assign(step, { only: p.only, check: p.check, branch, worktree: join(repoDir(state, p.root), branch.slice(3)) });
  }
}

/** Where a run works: the task folder, or for a patch step the same folder in its worktree. */
export async function workdir(task: Task, step: Step, x?: Exec): Promise<string> {
  if (!step.worktree) return task.folder;
  const root = task.options.root as string;
  await stepWorktree(root, step.worktree, step.branch!, task.options.base as string, x);
  return join(step.worktree, relative(root, realpathSync(task.folder)));
}

/** The engine's own verification of a patch step; an error landing it needs a person. */
export async function landStep(spec: Spec, state: string, task: Task, step: Step, x?: Exec): Promise<Landed> {
  const file = (run: string) => join(state, "runs", run, "context.md");
  const context = step.runs.map((r) => (existsSync(file(r.id)) ? readFileSync(file(r.id), "utf8") : "")).join("\n");
  return land({ spec, task, step, state, context, x }).catch(
    (e: Error): Landed => ({ ok: false, outcome: "blocked", reason: `wf could not land ${step.id}: ${e.message}` }),
  );
}
