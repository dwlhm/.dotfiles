// Patch steps (roles that edit): preparing the repo, base and check at submit, the folder a run
// works in, and the engine's own landing of the result (engine/land.ts).
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import type { Spec } from "./spec";
import type { Step, Task } from "./records";
import type { Submit } from "./types";
import type { Exec } from "./exec";
import { edits } from "./plans";
import { freeBranch, integration, repoDir, repoRoot, stepWorktree, tip, workBase } from "./repo";
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
  return { root, base, check: chosen.check, only: normalizeOnly(root, s.folder, (s.options.only as string[] | undefined) ?? []) };
}

/** Paths the user (or a planner) wrote relative to `folder`, made relative to the repo root. */
export function normalizeOnly(root: string, folder: string, paths: string[]): string[] {
  // git reports the canonical root (/private/var/…, resolved symlinks): compare like with like.
  const prefix = relative(root, realpathSync(folder));
  return paths.map((o) => join(prefix, o.replace(/^\.\//, "")).replace(/\/$/, "") || ".");
}

/** The integration branch's worktree (created, or found where it is already checked out). */
export function integrationWorktree(spec: Spec, state: string, root: string, base: string, x?: Exec): Promise<string> {
  return integration(root, join(repoDir(state, root), "_integration"), spec.policy.integration_branch, base, x);
}

/** Give every editing step its paths and check, then a branch and worktree. */
export async function assignPatch(spec: Spec, steps: Step[], p: Patch, state: string, x?: Exec): Promise<void> {
  for (const step of steps.filter((s) => edits(spec, s.role))) Object.assign(step, { only: p.only, check: p.check });
  await assignBranches(spec, steps, p.root, state, x);
}

/** A free branch `wf/<step>` and its worktree folder for every editing step that has none yet. */
export async function assignBranches(spec: Spec, steps: Step[], root: string, state: string, x?: Exec): Promise<void> {
  for (const step of steps.filter((s) => edits(spec, s.role) && !s.branch)) {
    const branch = await freeBranch(root, `wf/${step.id}`, x);
    Object.assign(step, { branch, worktree: join(repoDir(state, root), branch.slice(3)) });
  }
}

/**
 * Where a run works: the task folder, or for a patch step the same folder in its worktree. A step
 * that comes after other patch steps starts from the integration branch, where they were merged.
 */
export async function workdir(spec: Spec, task: Task, step: Step, x?: Exec): Promise<string> {
  if (!step.worktree) return task.folder;
  const root = task.options.root as string;
  if (!step.base) {
    const afterPatch = task.steps.some((s) => step.deps.includes(s.id) && s.worktree);
    step.base = afterPatch ? await tip(root, spec.policy.integration_branch, x) : (task.options.base as string);
  }
  await stepWorktree(root, step.worktree, step.branch!, step.base, x);
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
