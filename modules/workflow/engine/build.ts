// Turning an accepted plan into steps, and taking a proposal back when the user wants it changed.
// Plan paths are relative to the task's folder, like everything the user types.
import type { Spec } from "./spec";
import type { Command } from "./commands";
import type { Step, Task } from "./records";
import { stepId } from "./ids";
import { actions } from "./rules";
import { edits } from "./plans";
import { checkPlan, parsePlan, showPlan, type Plan } from "./planfmt";
import type { Engine } from "./engine";
import type { Active } from "./types";
import { assignBranches, integrationWorktree, normalizeOnly } from "./patch";
import { unknownPaths } from "./repo";
import { runCheck } from "./checks";
import { evidenceOf } from "./results";
import { writeState } from "./state";
import { join, relative } from "node:path";
import { realpathSync } from "node:fs";

const index = (id: string) => Number(id.split(".").pop());

/**
 * Step ids follow positions (the record schema). Steps placed by a plan, and the after-work ones
 * behind them, are renumbered to where they now stand; a step that has runs never moves, so its id
 * stays. Deps and proposal ids follow the renaming.
 */
export function renumber(task: Task): void {
  const rename = new Map<string, string>();
  task.steps.forEach((s, i) => {
    const id = stepId(Number(task.id.slice(1)), [i + 1]);
    if (s.id !== id && !s.runs.length) rename.set(s.id, id);
  });
  for (const s of task.steps) {
    s.id = rename.get(s.id) ?? s.id;
    s.deps = s.deps.map((d) => rename.get(d) ?? d);
  }
  const proposal = task.options.proposal as string[] | undefined;
  if (proposal) task.options = { ...task.options, proposal: proposal.map((p) => rename.get(p) ?? p) };
}

/** Merge `patch` into the task's options; `undefined` removes a key (records never hold one). */
export function setOptions(task: Task, patch: Record<string, unknown>): void {
  const next: Record<string, unknown> = { ...task.options, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  task.options = next;
}

/** The steps an accepted plan becomes: one per plan step (role: the stage after planning), plus a
 *  paired qa step for each that names a UI test. Ids continue after the task's current steps. */
export function planToSteps(spec: Spec, cmd: Command, task: Task, plan: Plan, only: (paths: string[]) => string[]): Step[] {
  const role = cmd.roles[1];
  const qaRole = [...spec.roles.values()].find((r) => r.can.includes("shell-qa") && edits(spec, r.name))?.name;
  const base = Math.max(...task.steps.map((s) => index(s.id)));
  const out: Step[] = [];
  const idOf = new Map<number, string>();
  plan.steps.forEach((p, i) => idOf.set(i + 1, stepId(Number(task.id.slice(1)), [base + 1 + i])));
  plan.steps.forEach((p, i) => {
    out.push({ id: idOf.get(i + 1)!, title: p.title, role, only: only(p.only), check: p.check, deps: p.after.map((d) => idOf.get(d)!), status: "queued", runs: [], steps: [] });
  });
  let next = base + plan.steps.length + 1;
  plan.steps.forEach((p, i) => {
    if (!p.qa || !qaRole) return;
    out.push({ id: stepId(Number(task.id.slice(1)), [next++]), title: `UI test flows for: ${p.title}`, role: qaRole, only: only([".qa/"]), check: p.qa, deps: [idOf.get(i + 1)!], status: "queued", runs: [], steps: [] });
  });
  return out;
}

/** Whether the user approves this plan before work starts (policy, `ask-first`, `just-go`). */
export function needsApproval(spec: Spec, task: Task, steps: number): boolean {
  if (task.options["just-go"]) return false;
  if (task.options["ask-first"]) return true;
  const large = steps > spec.policy.limits.small_task_steps;
  return actions(spec, { edits_code: true, touches_ui: false, result_patch: true, large_task: large }).has("require_approval");
}

/**
 * A planner's report: parsed and checked (a bad plan goes back to it as feedback), turned into
 * steps, and held for the user's approval when the policy asks for it.
 */
export async function acceptPlan(e: Engine, a: Active, report: string): Promise<{ ok: true; text: string; waiting: boolean } | { ok: false; reason: string }> {
  const parsed = parsePlan(report);
  if ("error" in parsed) return { ok: false, reason: `The plan could not be read: ${parsed.error}. Report it again in exactly the block format.` };
  const errors = checkPlan(parsed.plan, e.d.spec.policy.limits);
  if (errors.length) return { ok: false, reason: `The plan breaks these rules:\n${errors.map((x) => `- ${x}`).join("\n")}` };
  const { task } = a;
  const root = task.options.root as string;
  const wrong = unknownPaths(root, parsed.plan.steps.flatMap((s) => normalizeOnly(root, task.folder, s.only)));
  if (wrong.length) return { ok: false, reason: `These paths do not exist under ${task.folder}: ${wrong.join(", ")}. Write every path relative to ${task.folder}, the folder you work in.` };
  const steps = planToSteps(e.d.spec, e.d.spec.commands.get(task.command)!, task, parsed.plan, (p) => normalizeOnly(root, task.folder, p));
  const after = task.steps.filter((s) => e.d.spec.roles.get(s.role)!.after);
  task.steps = [...task.steps.filter((s) => !after.includes(s)), ...steps, ...after];
  for (const s of after) s.deps = workSteps(e, task).map((w) => w.id);
  setOptions(task, { proposal: steps.map((s) => s.id), later: parsed.plan.later });
  renumber(task);
  await assignBranches(e.d.spec, task.steps, task.options.root as string, e.d.state, e.d.exec);
  const text = showPlan(parsed.plan);
  return { ok: true, text, waiting: needsApproval(e.d.spec, task, parsed.plan.steps.length) };
}

/** The steps that do the work (not the planner's, not the after-work ones). */
export const workSteps = (e: Engine, task: Task): Step[] =>
  task.steps.filter((s) => !e.d.spec.roles.get(s.role)!.after && e.d.spec.roles.get(s.role)!.writes !== "plan");

export function approve(e: Engine, task: Task): void {
  if (task.status !== "awaiting_approval") throw new Error(`${task.id} is not waiting for approval (it is ${task.status})`);
  task.status = "running";
  e.d.log(`${task.id} plan approved`);
  e.advance(task);
}

/** The user wants the plan changed: drop the proposal and ask the planner again, with their words. */
export function tell(e: Engine, task: Task, text: string): void {
  if (task.status !== "awaiting_approval") throw new Error(`${task.id} is not waiting for approval; changing a running task comes later`);
  const proposal = new Set((task.options.proposal as string[] | undefined) ?? []);
  const planner = [...task.steps].reverse().find((s) => e.d.spec.roles.get(s.role)!.writes === "plan")!;
  task.steps = task.steps.filter((s) => !proposal.has(s.id));
  for (const s of task.steps.filter((x) => e.d.spec.roles.get(x.role)!.after)) s.deps = [planner.id];
  renumber(task);
  writeState(e.d.state, task.id, "feedback.md", `The user wants your plan changed: ${text.trim()}`);
  planner.status = "queued";
  task.status = "running";
  setOptions(task, { proposal: [], later: undefined });
  e.d.log(`${task.id} plan sent back: ${text.trim()}`);
  e.advance(task);
}

/** After every step merged: the task's check once more on the integration branch, all together. */
export async function finalCheck(e: Engine, task: Task): Promise<void> {
  const root = task.options.root as string;
  try {
    const wt = await integrationWorktree(e.d.spec, e.d.state, root, task.options.base as string, e.d.exec);
    const cwd = join(wt, relative(root, realpathSync(task.folder)));
    const r = await runCheck(task.options.check as string, cwd, e.d.spec.policy.limits.check_minutes, e.d.exec);
    if (!r.passed) return e.close(task, "blocked", `Every step passed on its own, but together \`${task.options.check}\` fails on ${e.d.spec.policy.integration_branch}:\n${r.tail}`);
    setOptions(task, { final_check: "passed" });
    e.d.log(`${task.id} integration check passed`);
  } catch (err) {
    return e.close(task, "blocked", `wf could not run the integration check: ${(err as Error).message}`);
  }
  e.advance(task);
}

/** A plan that ended with `later:` is planned on once its milestone is done. */
export function nextMilestone(e: Engine, task: Task): boolean {
  const later = task.options.later as string | undefined;
  if (!later) return false;
  const planner = task.steps.find((s) => e.d.spec.roles.get(s.role)!.writes === "plan")!;
  const id = stepId(Number(task.id.slice(1)), [Math.max(...task.steps.map((s) => index(s.id))) + 1]);
  const step: Step = { id, title: `next milestone: ${later}`, role: planner.role, only: [], deps: [], status: "queued", runs: [], steps: [] };
  const after = task.steps.filter((s) => e.d.spec.roles.get(s.role)!.after);
  task.steps = [...task.steps.filter((s) => !after.includes(s)), step, ...after];
  for (const s of after) s.deps = [step.id];
  renumber(task);
  writeState(e.d.state, task.id, "feedback.md", `The first milestone is done and merged:\n${evidenceOf(e.d.state, task, workSteps(e, task).map((s) => s.id))}\n\nNow plan the next milestone: ${later}`);
  setOptions(task, { later: undefined, final_check: undefined });
  return true;
}
