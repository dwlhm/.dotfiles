// Plan first: the agent of such a task researches and plans, hands its plan back with
// `board report plan`, and starts the work only once the person approves it (`board approve`).
// An answer instead asks for a revised plan. The board, not the prompt, holds the gate.
import type { Task } from "./store";

export type Approval = "pending" | "approved" | null;

/** Steps that are the work itself, closed to the agent until its plan is approved. */
const WORK = ["work", "review", "test", "done"];

/** Refuses the agent's own `phase <step>` or `report done` while its plan waits for approval. */
export function gate(task: Task, step: string) {
  if (task.approval !== "pending" || !WORK.includes(step)) return;
  throw new Error(`${task.id} is plan first: hand your plan back with \`board report plan "<goal>" --detail "<plan>"\` and wait for the person to approve it before you start the work`);
}

/** A task whose agent waits for the person to approve the plan it reported. */
export const reviewing = (task: Task) => task.phase === "waiting" && task.report?.status === "plan";

/** The approval as the agent receives it. */
export const APPROVED = "your plan is approved: implement it now (`board phase work`), then report as usual";

/** The part of the first prompt that tells a plan-first agent what to do. */
export function planFirst(task: Task): string {
  if (task.approval !== "pending") return "";
  return [
    `This task is plan first: research and plan only, change no files and make no commits until the person approves.`,
    `- Find out what the task needs (read the code, run read-only commands), then end your turn with \`board report plan "<goal in one sentence>" --detail "<markdown>"\`: \`**Context**\`, \`**Plan**\` (numbered, verifiable steps, files you will touch), \`**Risks**\`, \`**Open questions**\`.`,
    `- The answer comes back as a message starting with [board]: \`approve\` means start the work; any other answer asks for changes: revise the plan and \`board report plan\` again.`,
    `- Until approved, the board refuses \`board phase work|review|test\` and \`board report done\`; \`question\`, \`stuck\` and \`failed\` stay open to you.`,
  ].join("\n");
}
