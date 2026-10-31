// Task records (~/brain/tasks/<YYYY-MM>/<id>.md): the single source of truth of a task, its steps
// and every run. Terminals and processes are referenced by address, never copied (hc owns them).
import { Check } from "./check";
import { parseId, formatId, runId } from "./ids";
import type { Spec } from "./spec";

export const TASK_STATUS = ["planning", "awaiting_approval", "running", "paused", "blocked", "done", "failed", "stopped"];
export const STEP_STATUS = ["queued", "running", "paused", "done", "failed", "stopped", "split"];
const CLOSED = ["done", "failed", "stopped"];

export type Run = {
  id: string;
  runner: string;
  model: string;
  terminal: string | null;
  started: string;
  ended: string | null;
  outcome: string | null;
  summary?: string;
};
export type Step = {
  id: string;
  title: string;
  role: string;
  only: string[];
  check?: string;
  deps: string[];
  /** Agents this step may run on (one per step of a `many` command); else the task's `with`. */
  with?: string[];
  /** Patch steps: the step's own branch and the wf-owned worktree it is checked out in. */
  branch?: string;
  worktree?: string;
  /** The commit the step's branch started from (the task's base, or integration after its deps). */
  base?: string;
  status: string;
  runs: Run[];
  steps: Step[];
};
export type Task = {
  id: string;
  command: string;
  goal: string;
  folder: string;
  options: Record<string, unknown>;
  status: string;
  created: string;
  closed: string | null;
  steps: Step[];
  answers: { question: string; answer: string; at: string }[];
};

const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v)) && /T/.test(v);

class RecordCheck extends Check {
  constructor(
    file: string,
    readonly spec: Spec,
    readonly stepIds: Set<string>,
    errors: string[] = [],
  ) {
    super(file, errors);
  }
  /** The same checks with messages prefixed by `at`, writing into the same error list. */
  at(at: string): RecordCheck {
    return new RecordCheck(`${this.file}: ${at}`, this.spec, this.stepIds, this.errors);
  }
  time(obj: Record<string, unknown>, field: string, nullable: boolean): void {
    const v = obj[field];
    if (v === null && nullable) return;
    if (!isTime(v)) this.fail(field, "must be an ISO date-time (e.g. 2026-10-31T17:00:00Z)");
  }
}

function checkRun(parent: RecordCheck, r: Record<string, unknown>, step: string, n: number): void {
  const c = parent.at(`${step} runs[${n - 1}]`);
  if (r.id !== runId(step, n)) c.fail("id", `must be ${runId(step, n)} (runs are numbered in order)`);
  c.text(r, "runner");
  c.text(r, "model");
  if (r.terminal !== null && typeof r.terminal !== "string") c.fail("terminal", "must be an hc address or null");
  c.time(r, "started", false);
  c.time(r, "ended", true);
  const done = r.ended !== null;
  if (done !== (r.outcome !== null && r.outcome !== undefined)) c.fail("outcome", "is set exactly when the run has ended");
  if (r.outcome != null && !c.spec.vocab.outcomes.has(String(r.outcome))) c.fail("outcome", `unknown '${r.outcome}'`);
}

function collectIds(steps: unknown[], out: Set<string>): void {
  for (const s of steps) {
    const st = s as Record<string, unknown>;
    if (typeof st?.id === "string") out.add(st.id);
    if (Array.isArray(st?.steps)) collectIds(st.steps, out);
  }
}

function checkStep(parent: RecordCheck, s: Record<string, unknown>, expected: string, depth: number): void {
  const c = parent.at(expected);
  if (s.id !== expected) c.fail("id", `is ${JSON.stringify(s.id)}, expected ${expected}`);
  c.text(s, "title");
  c.oneOf(s, "role", c.spec.roles.keys());
  c.oneOf(s, "status", STEP_STATUS);
  c.list(s, "only");
  c.text(s, "check", true);
  c.text(s, "branch", true);
  c.text(s, "worktree", true);
  c.text(s, "base", true);
  for (const w of c.list(s, "with", true) ?? []) if (typeof w !== "string" || !w) c.fail("with", `${JSON.stringify(w)} is not an agent name`);
  for (const d of c.list(s, "deps") ?? []) {
    if (typeof d !== "string" || !c.stepIds.has(d) || d === expected) c.fail("deps", `${JSON.stringify(d)} is not another step of this task`);
  }
  (c.list(s, "runs") ?? []).forEach((r, i) => checkRun(parent, (r ?? {}) as Record<string, unknown>, expected, i + 1));
  const sub = c.list(s, "steps", true) ?? [];
  if (sub.length && depth >= c.spec.policy.limits.plan_depth) c.fail("steps", `nest deeper than plan_depth ${c.spec.policy.limits.plan_depth}`);
  if (sub.length && s.status !== "split") c.fail("status", "a step with sub-steps must be 'split'");
  sub.forEach((x, i) => checkStep(parent, (x ?? {}) as Record<string, unknown>, `${expected}.${i + 1}`, depth + 1));
}

function findCycle(steps: Step[]): string | null {
  const deps = new Map<string, string[]>();
  const walk = (list: Step[]) => list.forEach((s) => (deps.set(s.id, s.deps), walk(s.steps)));
  walk(steps);
  const state = new Map<string, "open" | "done">();
  const visit = (id: string): string | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "open") return id;
    state.set(id, "open");
    for (const d of deps.get(id) ?? []) if (visit(d)) return id;
    state.set(id, "done");
    return null;
  };
  for (const id of deps.keys()) if (visit(id)) return id;
  return null;
}

/** Every problem with a task record's frontmatter; empty when it is valid. */
export function checkTask(file: string, d: Record<string, unknown>, spec: Spec): string[] {
  const ids = new Set<string>();
  collectIds(Array.isArray(d.steps) ? d.steps : [], ids);
  const c = new RecordCheck(file, spec, ids);
  const id = typeof d.id === "string" ? parseId(d.id) : null;
  if (!id || id.kind !== "task") c.fail("id", "must be a task id like w12");
  c.oneOf(d, "command", spec.commands.keys());
  c.text(d, "goal");
  const folder = c.text(d, "folder");
  if (folder && !folder.startsWith("/")) c.fail("folder", "must be an absolute path");
  c.map(d, "options");
  const status = c.oneOf(d, "status", TASK_STATUS);
  c.time(d, "created", false);
  c.time(d, "closed", true);
  if (status && CLOSED.includes(status) !== (d.closed !== null)) c.fail("closed", "is set exactly when the task is done, failed or stopped");
  const base = id ? formatId(id) : "w0";
  (c.list(d, "steps") ?? []).forEach((s, i) => checkStep(c, (s ?? {}) as Record<string, unknown>, `${base}.${i + 1}`, 1));
  c.list(d, "answers");
  if (!c.errors.length) {
    const loop = findCycle(d.steps as Step[]);
    if (loop) c.fail("steps", `dependency cycle through ${loop}`);
  }
  return c.errors;
}
