// A run's first message: its role's prompt filled from the task, the steps it depends on, the
// private context chosen for it, and feedback (why the last attempt failed, or the user's words).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Engine } from "./engine";
import type { Step, Task } from "./records";
import { renderPrompt } from "./prompt";
import { varsFor } from "./plans";
import { readState, takeState } from "./state";

/** `context` is what the leak check later compares the patch against. */
export type Composed = { prompt: string; context: string };

export function compose(e: Engine, task: Task, step: Step, run: string, multiline: boolean): Composed {
  const role = e.d.spec.roles.get(step.role)!;
  const sections = e.d.knowledge.context({ folder: task.folder, paths: (task.options.about as string[]) ?? [], goal: task.goal, budget: e.d.spec.policy.limits.context_bytes });
  const evidence = role.needs.includes("evidence") ? e.evidence(task, step.deps) : undefined;
  const vars = varsFor(task, e.finished(task, step.deps), readState(e.d.state, task.id, "target.md"), step, evidence);
  const last = step.runs.at(-1);
  const failed = last?.outcome === "fail" ? join(e.d.state, "runs", last.id, "report.md") : undefined;
  const feedback = failed && existsSync(failed) ? readFileSync(failed, "utf8") : role.writes === "plan" ? takeState(e.d.state, task.id, "feedback.md") : undefined;
  const prompt = renderPrompt({ role, vocab: e.d.spec.vocab, vars, context: sections, run, multiline, feedback });
  return { prompt, context: sections.map((c) => c.text).join("\n\n") };
}
