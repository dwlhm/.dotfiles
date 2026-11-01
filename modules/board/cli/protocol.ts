// The first prompt an agent gets for a task: the work, and how it keeps its card up to date.
import { AGENTS } from "./agents";
import type { Task } from "./store";

export function protocol(task: Task, parent: Task | null): string {
  const reportsTo = task.creator === "user" ? "the person" : `the agent of ${task.creator}`;
  return [
    `You are working on board task ${task.id}: ${task.title}`,
    parent ? `It is a sub-task of ${parent.id}: ${parent.title}` : "",
    task.brief ? `\n${task.brief}\n` : "",
    `The person follows your work on a kanban board; keep your card true with the \`board\` CLI (it knows which task is yours):`,
    `- \`board phase plan|work|review|test "<short note>"\` whenever you move to that stage.`,
    `- To hand a part to another agent: \`board sub "<title>" --agent ${Object.keys(AGENTS).join("|")} --brief "<what, where, how to check it>"\`. Its result comes back to you as a message starting with [board]; answer its questions with \`board answer <id> "<text>"\`.`,
    `- End with exactly one \`board report done|question|stuck|failed "<headline>" --detail "<markdown>"\`; it goes to ${reportsTo}. After question or stuck, wait for the answer, continue, and report again.`,
    `  The card shows only the headline, the task dialog renders the detail as Markdown. Write both in the language the person writes to you:`,
    `  - headline: one plain sentence. For question: the exact question to answer ("Pakai SQLite atau Postgres?"); for stuck: what blocks you; for done/failed: the outcome.`,
    `  - detail: short Markdown sections, e.g. \`**Context**\`, \`**Plan**\` (numbered steps), \`**Changed**\`, \`**Verified**\`, \`**Check yourself**\`, \`**Not done**\`; lists over long paragraphs.`,
    `  - question: add each possible answer as \`--option "<answer>"\`, your recommendation first; the person can pick one or write their own.`,
  ].filter(Boolean).join("\n");
}

export const handBack = (from: string, status: string, text: string) => `[board] ${from} ${status}: ${text}`;
