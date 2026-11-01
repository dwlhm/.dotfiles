// The first prompt an agent gets for a task: the work, and how it keeps its card up to date.
import { AGENTS } from "./agents";
import { reportText } from "./report";
import type { Task } from "./store";

/** `source`: the task this one follows up on; `forked`: the agent already holds its context. */
export function protocol(task: Task, parent: Task | null, source: Task | null = null, forked = false): string {
  const reportsTo = task.creator === "user" ? "the person" : `the agent of ${task.creator}`;
  return [
    `You are working on board task ${task.id}: ${task.title}`,
    parent ? `It is a sub-task of ${parent.id}: ${parent.title}` : "",
    source ? followUp(source, forked) : "",
    task.brief ? `\n${task.brief}\n` : "",
    workspace(task),
    `The person follows your work on a kanban board; keep your card true with the \`board\` CLI (it knows which task is yours):`,
    `- \`board phase plan|work|review|test "<short note>"\` whenever you move to that stage.`,
    `- To hand a part to another agent: \`board sub "<title>" --agent ${Object.keys(AGENTS).join("|")} --brief "<what, where, how to check it>"\`. Its result comes back to you as a message starting with [board]; answer its questions with \`board answer <id> "<text>"\`.`,
    `- End with exactly one \`board report done|question|stuck|failed "<headline>" --detail "<markdown>"\`; it goes to ${reportsTo}. After question or stuck, wait for the answer, continue, and report again. After done or failed your terminal ends once this turn ends, so make the report your last step.`,
    `  The card shows only the headline, the task dialog renders the detail as Markdown. Write both in the language the person writes to you:`,
    `  - headline: one plain sentence. For question: the exact question to answer ("Pakai SQLite atau Postgres?"); for stuck: what blocks you; for done/failed: the outcome.`,
    `  - detail: short Markdown sections, e.g. \`**Context**\`, \`**Plan**\` (numbered steps), \`**Changed**\`, \`**Verified**\`, \`**Check yourself**\`, \`**Not done**\`; lists over long paragraphs.`,
    `  - question: add each possible answer as \`--option "<answer>"\`, your recommendation first; the person can pick one or write their own.`,
  ].filter(Boolean).join("\n");
}

export const handBack = (from: string, status: string, text: string) => `[board] ${from} ${status}: ${text}`;

/** How the agent's work reaches the person when it runs in a worktree (`worktree.ts`). */
function workspace(task: Task): string {
  const w = task.worktree;
  if (!w) return "";
  const lands = task.auto_land ? `the board then puts your commits on ${w.target}'s branch` : "the person then lands your commits; until then your card waits, your terminal stays, and an answer asks for changes";
  return [
    `You work in your own git worktree ${w.path} on branch ${w.branch}; your commits land in ${w.target}, which you never edit.`,
    `- Commit your work there (Conventional Commits) with the trailer \`Board-Task: ${task.id}\`.`,
    `- Before \`board report done\`: rebase onto ${w.target}'s current HEAD (\`git rebase $(git -C ${w.target} rev-parse HEAD)\`), resolve any conflicts, rerun the checks. The board refuses done while the worktree has uncommitted changes or is behind; ${lands}.`,
  ].join("\n");
}

function followUp(source: Task, forked: boolean): string {
  const head = `It follows up on ${source.id}: ${source.title}`;
  if (forked) return `${head} (this session continues from that task's conversation; that task is closed, this is a new one).`;
  return [head, source.report ? `Its last report: ${reportText(source.report)}` : "", source.brief ? `Its brief:\n${source.brief}` : ""].filter(Boolean).join("\n");
}
