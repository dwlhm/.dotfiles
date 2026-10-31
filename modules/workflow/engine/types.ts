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
  /** Where the engine's own status (OSC 7501) goes; the terminal in production, a list in tests. */
  write?: (text: string) => void;
  /** Runs git and gh for resolving review targets (a fake in tests). */
  exec?: Exec;
};
export type Active = {
  task: Task;
  step: Step;
  run: Run;
  working: boolean;
  nudged: number;
  /** `take`: the user drives this run, so the engine stops reconciling it until `give back`. */
  taken?: boolean;
  /** Epoch ms the run's time limits count from; `give back` restarts them at now. Unset means `run.started`. */
  limitsFrom?: number;
};
export type Result = { task: Task; text: string };
export type Submit = { command: string; goal: string; folder: string; options: Record<string, unknown> };

/** The engine's own status as OSC 7501: the most urgent open state, why, and whether it waits for a person. */
export type Report = {
  state: "blocked" | "working" | "idle";
  /** Set only while the engine waits for the user (a blocked task or a plan to approve). */
  kind?: "question";
  msg: string;
};
