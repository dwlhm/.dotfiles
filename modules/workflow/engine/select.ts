// `wf <command> <what>`: an id names a task, step or run; words name one by a case-insensitive
// substring of an open task's goal or a step's title. Pure: it only reads the tasks it is given.
import { formatId, parseId, taskId, type Id } from "./ids";
import type { Run, Step, Task } from "./records";
import { flat } from "./steps";

export type Picked = { task: Task; step?: Step; run?: Run };
export type Selected = Picked | { error: string };

const CLOSED = new Set(["done", "failed", "stopped"]);

/** A candidate as errors list it. */
const named = (id: string, title: string) => `${id}: ${title}`;
const list = (items: string[]) => items.join("; ");
const runTitle = (r: Run) => `${r.runner}·${r.model} ${r.outcome ?? "running"}`;
const stepTitles = (task: Task) => flat(task.steps).map((s) => named(s.id, s.title));

const noOpen = (open: Task[]) =>
  open.length ? ` (open: ${list(open.map((t) => named(t.id, t.goal)))})` : " (there are no open tasks)";

/** Resolve `words` against the open tasks: exactly one candidate, or an error naming the others. */
export function select(tasks: Task[], words: string): Selected {
  const open = tasks.filter((t) => !CLOSED.has(t.status));
  const w = words.trim();
  if (!w) return { error: "nothing to select: give a task, step or run id, or words from a goal or title" };
  const id = parseId(w);
  return id ? byId(open, id) : byWords(open, w);
}

function byId(open: Task[], id: Id): Selected {
  const task = open.find((t) => t.id === taskId(id.task));
  if (!task) return { error: `no open task ${taskId(id.task)}${noOpen(open)}` };
  if (id.kind === "task") return { task };
  const stepName = formatId({ kind: "step", task: id.task, path: id.path });
  const step = flat(task.steps).find((s) => s.id === stepName);
  if (!step) return { error: `${task.id} has no step ${stepName}${stepsNote(task)}` };
  if (id.kind === "step") return { task, step };
  const run = step.runs.find((r) => r.id === formatId(id));
  if (!run) return { error: `${step.id} has no run ${formatId(id)}${runsNote(step)}` };
  return { task, step, run };
}

const stepsNote = (task: Task) => (task.steps.length ? ` (its steps: ${list(stepTitles(task))})` : " (it has no steps)");
const runsNote = (step: Step) => (step.runs.length ? ` (its runs: ${list(step.runs.map((r) => named(r.id, runTitle(r))))})` : " (it has no runs)");

function byWords(open: Task[], w: string): Selected {
  const q = w.toLowerCase();
  const hits: { picked: Picked; label: string }[] = [];
  for (const task of open) {
    if (task.goal.toLowerCase().includes(q)) hits.push({ picked: { task }, label: named(task.id, task.goal) });
    for (const step of flat(task.steps)) {
      if (step.title.toLowerCase().includes(q)) hits.push({ picked: { task, step }, label: named(step.id, step.title) });
    }
  }
  if (hits.length === 1) return hits[0].picked;
  if (!hits.length) return { error: `nothing matches '${w}'${noOpen(open)}` };
  return { error: `'${w}' matches more than one: ${list(hits.map((h) => h.label))}` };
}
