// IDs: task `w12`, step `w12.2` (nested `w12.2.1`), run `w12.2-r1`. One grammar, parsed in one place.

export type Id =
  | { kind: "task"; task: number }
  | { kind: "step"; task: number; path: number[] }
  | { kind: "run"; task: number; path: number[]; run: number };

const GRAMMAR = /^w([1-9]\d*)((?:\.[1-9]\d*)*)(?:-r([1-9]\d*))?$/;

export function parseId(text: string): Id | null {
  const m = GRAMMAR.exec(text.trim());
  if (!m) return null;
  const task = Number(m[1]);
  const path = m[2] ? m[2].slice(1).split(".").map(Number) : [];
  if (m[3]) return path.length ? { kind: "run", task, path, run: Number(m[3]) } : null;
  return path.length ? { kind: "step", task, path } : { kind: "task", task };
}

export function formatId(id: Id): string {
  const base = `w${id.task}${id.kind === "task" ? "" : id.path.map((n) => `.${n}`).join("")}`;
  return id.kind === "run" ? `${base}-r${id.run}` : base;
}

export const taskId = (task: number): string => formatId({ kind: "task", task });
export const stepId = (task: number, path: number[]): string => formatId({ kind: "step", task, path });
export const runId = (step: string, run: number): string => `${step}-r${run}`;

/** The id one level up: run → step, step → parent step or task, task → null. */
export function parentId(text: string): string | null {
  const id = parseId(text);
  if (!id || id.kind === "task") return null;
  if (id.kind === "run") return stepId(id.task, id.path);
  return id.path.length > 1 ? stepId(id.task, id.path.slice(0, -1)) : taskId(id.task);
}
