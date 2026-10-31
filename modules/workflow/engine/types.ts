// The engine's shared shapes: what it is built from, a run in flight, a task's result, a submission.
import type { Spec } from "./spec";
import type { Host } from "./host";
import type { Knowledge } from "./knowledge";
import type { Store } from "./store";
import type { Task, Step, Run } from "./records";
import type { Runner } from "./runners";
import type { Exec } from "./exec";

export type Deps = {
  spec: Spec;
  runners: Map<string, Runner>;
  host: Host;
  store: Store;
  knowledge: Knowledge;
  state: string;
  now: () => Date;
  log: (line: string) => void;
  /** Runs git and gh for resolving review targets (a fake in tests). */
  exec?: Exec;
};
export type Active = { task: Task; step: Step; run: Run; working: boolean; nudged: number };
export type Result = { task: Task; text: string };
export type Submit = { command: string; goal: string; folder: string; options: Record<string, unknown> };
