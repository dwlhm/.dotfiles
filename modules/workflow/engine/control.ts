// Control operations over the engine (each one a server op): status, show, pause, resume, stop,
// tell, take and give back. Selection is pure (`select`); a refusal always names the current status.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Engine } from "./engine";
import type { Run, Step, Task } from "./records";
import { select, type Picked } from "./select";
import { flat } from "./steps";
import { workSteps, tell as tellPlan } from "./build";

const stamp = (e: Engine): string => e.d.now().toISOString().replace(/\.\d{3}Z$/, "Z");

const pick = (e: Engine, what: string): Picked => {
  const picked = select([...e.tasks.values()], what);
  if ("error" in picked) throw new Error(picked.error);
  return picked;
};

/** The task a task-level operation acts on; a step or run is not a task. */
function taskFor(e: Engine, what: string, op: string): Task {
  const picked = pick(e, what);
  if (picked.step) throw new Error(`${op} takes a task, not ${picked.step.id} (${picked.task.id} is ${picked.task.status})`);
  return picked.task;
}

const activeFor = (e: Engine, task: Task) => [...e.active.values()].filter((a) => a.task.id === task.id);

/** `status`: each open task with its work progress and the runs it has in flight. */
export function status(e: Engine): string {
  const tasks = [...e.tasks.values()];
  if (!tasks.length) return "no open tasks";
  return tasks
    .map((task) => {
      const leaves = flat(workSteps(e, task)).filter((s) => !s.steps.length);
      const done = leaves.filter((s) => s.status === "done").length;
      const runs = activeFor(e, task).map(
        (a) => `  ${a.run.id} ${a.run.runner}·${a.run.model} ${a.run.terminal ?? "starting"}${a.taken ? " (taken)" : ""}`,
      );
      return [`${task.id} ${task.command} ${task.status}: ${task.goal} (${done}/${leaves.length})`, ...runs].join("\n");
    })
    .join("\n");
}

const runLine = (r: Run): string =>
  `${r.id} ${r.runner}·${r.model} ${r.outcome ?? "running"}${r.summary ? `: ${r.summary}` : ""} (${r.terminal ?? "no terminal"})`;

function renderStep(step: Step, base: number): string[] {
  const pad = "  ".repeat(Math.max(0, step.id.split(".").length - 1 - base));
  const lines = [`${pad}${step.id} [${step.status}] ${step.title}`];
  for (const run of step.runs) lines.push(`${pad}  ${runLine(run)}`);
  for (const child of step.steps) lines.push(...renderStep(child, base));
  return lines;
}

function renderRun(e: Engine, run: Run): string[] {
  const dir = join(e.d.state, "runs", run.id);
  const artifacts = ["report.md", "screen.txt", "context.md"].map((f) => join(dir, f)).filter((f) => existsSync(f));
  return [
    runLine(run),
    `  runner: ${run.runner}`,
    `  model: ${run.model}`,
    `  terminal: ${run.terminal ?? "none"}`,
    `  started: ${run.started}`,
    `  ended: ${run.ended ?? "—"}`,
    `  outcome: ${run.outcome ?? "running"}`,
    `  summary: ${run.summary ?? ""}`,
    `  artifacts: ${artifacts.length ? "" : "none"}`,
    ...artifacts.map((f) => `    ${f}`),
  ];
}

/** `show <what>`: a task as a step tree, a step with its runs, or one run's details and artifacts. */
export function show(e: Engine, what: string): string {
  const picked = pick(e, what);
  if (picked.run) return renderRun(e, picked.run).join("\n");
  if (picked.step) return renderStep(picked.step, picked.step.id.split(".").length - 1).join("\n");
  const task = picked.task;
  const base = 1;
  const lines = [`${task.id} ${task.command} ${task.status}: ${task.goal}`];
  for (const step of task.steps) lines.push(...renderStep(step, base));
  return lines.join("\n");
}

/** `pause <task>`: stop dispatching new steps; runs already in flight go on. */
export function pause(e: Engine, what: string): string {
  const task = taskFor(e, what, "pause");
  if (task.status !== "running") throw new Error(`${task.id} is ${task.status}, not running`);
  task.status = "paused";
  e.d.store.save(task);
  void e.d.store.commit(task);
  e.d.log(`${task.id} paused`);
  return `${task.id} paused (${activeFor(e, task).length} run(s) still going)`;
}

/** `resume <task>`: accept work again, then dispatch whatever is now ready. */
export function resume(e: Engine, what: string): string {
  const task = taskFor(e, what, "resume");
  if (task.status !== "paused") throw new Error(`${task.id} is ${task.status}, not paused`);
  task.status = "running";
  e.d.store.save(task);
  void e.d.store.commit(task);
  e.d.log(`${task.id} resumed`);
  e.advance(task);
  return `${task.id} running`;
}

/** End one active run as `stopped`: keep its screen, close its terminal, never advance the task. */
async function endStopped(e: Engine, a: { run: Run; task: Task }): Promise<void> {
  if (!e.active.delete(a.run.id)) return;
  const dir = join(e.d.state, "runs", a.run.id);
  mkdirSync(dir, { recursive: true });
  if (a.run.terminal) {
    writeFileSync(join(dir, "screen.txt"), await e.d.host.snapshot(a.run.terminal, 200).catch(() => ""));
    await e.d.host.close(a.run.terminal).catch(() => {});
  }
  writeFileSync(join(dir, "report.md"), "The user stopped the task");
  Object.assign(a.run, { ended: stamp(e), outcome: "stopped", summary: "The user stopped the task" });
  e.d.log(`${a.run.id} stopped: The user stopped the task`);
}

/** `stop <task>`: end every active run, stop what never started, close the task as `stopped`. */
export async function stop(e: Engine, what: string): Promise<string> {
  const task = taskFor(e, what, "stop");
  for (const a of activeFor(e, task)) await endStopped(e, a);
  for (const step of flat(task.steps)) {
    if (step.status === "queued" || step.status === "running" || step.status === "paused") step.status = "stopped";
  }
  const kept = flat(task.steps)
    .filter((s) => s.branch || s.worktree)
    .map((s) => `- ${s.id}${s.branch ? ` branch ${s.branch}` : ""}${s.worktree ? ` worktree ${s.worktree}` : ""}`);
  const text = ["The user stopped the task.", ...(kept.length ? ["Kept:", ...kept] : [])].join("\n");
  e.close(task, "stopped", text);
  return text;
}

export type Told = { task: Task; text: string; wait: boolean };

/** `tell <task> "<text>"`: to the plan while it waits, else into every active run's terminal. */
export async function tell(e: Engine, what: string, text: string): Promise<Told> {
  if (!text.trim()) throw new Error("the message is empty");
  const task = taskFor(e, what, "tell");
  if (task.status === "awaiting_approval") {
    tellPlan(e, task, text);
    return { task, text: `${task.id} plan sent back`, wait: true };
  }
  if (task.status !== "running") throw new Error(`${task.id} is ${task.status}, not running or awaiting approval`);
  const sent: string[] = [];
  for (const a of activeFor(e, task)) {
    if (!a.run.terminal) continue;
    await e.d.host.send(a.run.terminal, `Message from the user: ${text.trim()}`);
    sent.push(`${a.run.id} (${a.run.terminal})`);
  }
  if (!sent.length) throw new Error(`${task.id} is running but no run has a terminal yet`);
  e.d.log(`${task.id} told: ${text.trim()}`);
  return { task, text: `sent to ${sent.join(", ")}`, wait: false };
}

/** The active run a step is driving, if any. */
const activeRun = (e: Engine, step: Step): { a: ReturnType<typeof activeFor>[number]; run: Run } | null => {
  const a = [...e.active.values()].find((x) => x.step.id === step.id);
  return a ? { a, run: a.run } : null;
};

function taken(e: Engine, what: string, op: string): { a: ReturnType<typeof activeFor>[number]; run: Run } {
  const picked = pick(e, what);
  if (!picked.step) throw new Error(`${op} takes a step or run, not the task ${picked.task.id} (it is ${picked.task.status})`);
  if (picked.run) {
    const a = e.active.get(picked.run.id);
    if (!a) throw new Error(`${picked.run.id} is not active (it ${picked.run.ended ? `ended ${picked.run.outcome}` : "was never started"})`);
    return { a, run: picked.run };
  }
  const hit = activeRun(e, picked.step);
  if (!hit) throw new Error(`${picked.step.id} has no active run (it is ${picked.step.status})`);
  return hit;
}

/** `take <step|run>`: the user drives this run; the engine stops reconciling it until `give back`. */
export function take(e: Engine, what: string): string {
  const { a, run } = taken(e, what, "take");
  a.taken = true;
  e.d.log(`${run.id} taken by the user`);
  return `${run.id} is yours; the engine will not check on it until \`wf give back ${run.id}\`${run.terminal ? ` (terminal ${run.terminal})` : ""}`;
}

/** `give back <step|run>`: reconcile again, with the time limits counted from now. */
export function giveBack(e: Engine, what: string): string {
  const { a, run } = taken(e, what, "give back");
  if (!a.taken) throw new Error(`${run.id} is not taken`);
  a.taken = false;
  a.nudged = 0;
  a.limitsFrom = e.d.now().getTime();
  e.d.log(`${run.id} given back`);
  return `${run.id} is back with the engine; its time limits count from now`;
}
