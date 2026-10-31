// Per-task runtime files (`<state>/tasks/<id>/`): inputs that must not go into the brain record.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeState(state: string, id: string, name: string, text: string): void {
  mkdirSync(join(state, "tasks", id), { recursive: true });
  writeFileSync(join(state, "tasks", id, name), text);
}
export function readState(state: string, id: string, name: string): string | undefined {
  const f = join(state, "tasks", id, name);
  return existsSync(f) ? readFileSync(f, "utf8") : undefined;
}
/** Read once: a note meant for the next run only. */
export function takeState(state: string, id: string, name: string): string | undefined {
  const text = readState(state, id, name);
  if (text !== undefined) rmSync(join(state, "tasks", id, name));
  return text;
}
