// From a command to steps, and from finished steps to the task's result. Pure: no IO, no state.
// A command's roles are stages; `many` runs the first stage once per agent (spec/commands.md).
import type { Spec } from "./spec";
import type { Command } from "./commands";
import type { Step, Task } from "./records";
import { choices, type Runner } from "./runners";
import { stepId } from "./ids";
import type { Vars } from "./prompt";
import { actions } from "./rules";

/** The prompt variables the engine can fill so far; a role needing others is not runnable yet. */
export const SUPPLIED = ["question", "goal", "about", "answers", "target", "brief", "only", "check", "evidence"];
/** Roles whose output the engine cannot turn into work yet (a plan becomes steps in `build`). */
export const NOT_YET: string[] = [];
/** How many agents `compare` asks when the user names none. */
export const MANY_DEFAULT = 3;

/** Whether any role of the command needs the prompt variable `v`. */
export const needs = (spec: Spec, c: Command, v: string): boolean => c.roles.some((r) => spec.roles.get(r)!.needs.includes(v));

export const available = (spec: Spec, c: Command): boolean =>
  c.roles.every((r) => !NOT_YET.includes(r) && spec.roles.get(r)!.needs.every((n) => SUPPLIED.includes(n)));

/** Whether a role edits files (and so is a patch step: worktree, check, merge). */
export const edits = (spec: Spec, role: string): boolean => spec.roles.get(role)!.can.includes("edit");

export type Finished = { step: Step; agent: string; text: string };

/** The agents the first stage runs on: `with` as given, else one per eligible runner. */
function agentsFor(spec: Spec, runners: Map<string, Runner>, cmd: Command, wanted: string[]): string[] {
  const role = spec.roles.get(cmd.roles[0])!;
  const eligible = [...new Set(choices(role, runners, spec.vocab.tiers).map((c) => c.runner.name))];
  for (const name of wanted) {
    if (!runners.has(name)) throw new Error(`unknown agent '${name}' (known: ${[...runners.keys()].join(", ")})`);
    if (!eligible.includes(name)) throw new Error(`${name} cannot do '${cmd.name}' (it needs: ${role.can.join(", ")})`);
  }
  if (!cmd.many) {
    if (!eligible.length) throw new Error(`no agent can do '${cmd.name}' (it needs: ${role.can.join(", ")}, tier ${role.tier}+)`);
    return [];
  }
  const agents = wanted.length ? wanted : eligible.slice(0, MANY_DEFAULT);
  if (agents.length < 2) throw new Error(`'${cmd.name}' needs at least two agents; eligible: ${eligible.join(", ") || "none"}`);
  return agents;
}

/** The task's steps: stage 1 (one step, or one per agent), then one step per later stage. */
export function planSteps(spec: Spec, runners: Map<string, Runner>, cmd: Command, task: number, goal: string, wanted: string[]): Step[] {
  const step = (n: number, role: string, title: string, deps: string[], agent?: string): Step => ({
    id: stepId(task, [n]), title, role, only: [], deps, status: "queued", runs: [], steps: [], ...(agent ? { with: [agent] } : {}),
  });
  const agents = agentsFor(spec, runners, cmd, wanted);
  // A planning first stage: the plan's steps replace the later stages once it is accepted.
  if (spec.roles.get(cmd.roles[0])!.writes === "plan") return withCurator(spec, cmd, [step(1, cmd.roles[0], goal, [])], step);
  // Every later stage must be runnable before any work starts, not discovered after it.
  for (const name of cmd.roles.slice(1)) {
    const role = spec.roles.get(name)!;
    if (!choices(role, runners, spec.vocab.tiers, laterWith(cmd, wanted)).length) {
      throw new Error(`no agent can do the ${name} stage of '${cmd.name}' (it needs: ${role.can.join(", ")}, tier ${role.tier}+)`);
    }
  }
  const first = agents.length ? agents.map((a, i) => step(i + 1, cmd.roles[0], `${goal} (${a})`, [], a)) : [step(1, cmd.roles[0], goal, [])];
  const out = [...first];
  for (const role of cmd.roles.slice(1)) out.push(step(out.length + 1, role, `${role}: ${goal}`, out.slice(-first.length).map((s) => s.id)));
  return withCurator(spec, cmd, out, step);
}

/** Policy: after patch work lands, the knowledge-writing role records what it proved. */
function withCurator(spec: Spec, cmd: Command, out: Step[], step: (n: number, role: string, title: string, deps: string[]) => Step): Step[] {
  const curator = [...spec.roles.values()].find((r) => r.writes === "knowledge");
  const facts = { edits_code: false, touches_ui: false, result_patch: cmd.result === "patch", large_task: false };
  if (curator && actions(spec, facts).has("curate_facts")) out.push(step(out.length + 1, curator.name, `curate: ${cmd.name}`, out.map((s) => s.id)));
  return out;
}

/** `with` names the agents of the first stage; for a `many` command the later stages pick freely. */
export const laterWith = (cmd: Command, wanted: string[]): string[] => (cmd.many ? [] : wanted);

/** `target`: the resolved review target, `evidence`: what the work proved (both from runtime state). */
export function varsFor(task: Task, finished: Finished[], target?: string, step?: Step, evidence?: string): Vars {
  const answers = finished.map((f) => `### ${f.agent}\n${f.text.trim()}`).join("\n\n");
  const about = (task.options.about as string[] | undefined) ?? ["the whole folder"];
  const patch = step?.worktree ? { brief: step.title, only: step.only.length ? step.only : ["any file in the repository"] } : {};
  const check = step?.check ?? (task.options.check as string | undefined);
  const extra = { ...(target === undefined ? {} : { target }), ...(evidence === undefined ? {} : { evidence }) };
  return { question: task.goal, goal: task.goal, about, answers, ...patch, ...(check ? { check } : {}), ...extra };
}

/** A later stage runs only on enough input: one finished step, or two for a `many` comparison. */
export const enoughInput = (cmd: Command, finished: Finished[]): boolean => finished.length >= (cmd.many ? 2 : 1);

/** The result: the last stage's text, with each agent's answer under it for a `many` command. */
/**
 * The task's result from its work steps. `aside` roles never make the result: after-work roles
 * add notes, and a planner's plan was already shown for approval.
 */
export function resultOf(cmd: Command, all: Step[], finished: Map<string, Finished>, after: Set<string> = new Set(), planner: Set<string> = new Set()): { status: "done" | "failed"; text: string } {
  const r = workResult(cmd, all.filter((s) => !after.has(s.role) && !planner.has(s.role)), finished);
  const notes = all.filter((s) => after.has(s.role)).map((s) => finished.get(s.id)?.text.trim()).filter(Boolean);
  return notes.length && r.status === "done" ? { ...r, text: [r.text, ...notes].join("\n\n") } : r;
}

function workResult(cmd: Command, steps: Step[], finished: Map<string, Finished>): { status: "done" | "failed"; text: string } {
  const last = steps[steps.length - 1];
  const lastDone = finished.get(last.id);
  if (!cmd.many && steps.length > 1) {
    const parts = steps.map((s) => `## ${s.id}: ${s.title}\n\n${finished.get(s.id)?.text.trim() ?? missing(s)}`);
    return { status: steps.every((s) => finished.has(s.id)) ? "done" : "failed", text: parts.join("\n\n") };
  }
  if (!cmd.many) return lastDone ? { status: "done", text: lastDone.text.trim() } : { status: "failed", text: why(last) };
  const first = steps.filter((s) => s.role === cmd.roles[0]);
  const answers = first.map((s) => {
    const f = finished.get(s.id);
    return f ? `## ${f.agent}\n\n${f.text.trim()}` : `## ${s.with?.[0] ?? s.id} (no answer)\n\n${why(s)}`;
  });
  if (!first.some((s) => finished.has(s.id))) return { status: "failed", text: answers.join("\n\n") };
  const summary = lastDone ? lastDone.text.trim() : last.status === "stopped" ? "No comparison: only one agent answered." : `No comparison. ${why(last)}`;
  return { status: "done", text: [`## Summary\n\n${summary}`, ...answers].join("\n\n") };
}

/** Why a step has no result: not started, its sub-steps' trouble, or what its runs ended with. */
function missing(s: Step): string {
  if (s.status === "stopped") return "Not started: a step it needs did not finish.";
  if (s.status === "split") return s.steps.map((c) => `- ${c.id}: ${c.status === "done" ? "done" : missing(c)}`).join("\n");
  return why(s);
}

/** Why a step has no result: what each of its runs ended with. */
export const why = (s: Step): string => {
  const tried = s.runs.map((r) => `${r.runner}·${r.model}: ${r.summary ?? r.outcome}`).join("; ");
  return `No runner left for this step.${tried ? ` Tried: ${tried}` : ""}`;
};
