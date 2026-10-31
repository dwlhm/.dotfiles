// Where wf keeps its records in the private brain repo, and the one line format of a saved decision.
import { join } from "node:path";

export type Scope = "project" | "all";
export type Decision = { date: string; scope: Scope; text: string; from: string };

export const DECISIONS_HEADING = "## Decisions";

export function brainLayout(root: string) {
  return {
    projectsIndex: join(root, "projects", "README.md"),
    knowledgeIndex: join(root, "knowledge", "README.md"),
    /** Project-scoped decisions live under DECISIONS_HEADING in the project's own file. */
    projectFile: (file: string) => join(root, "projects", file),
    globalDecisions: join(root, "decisions.md"),
    /** `created` is the task's ISO creation time: records are grouped by month. */
    taskRecord: (id: string, created: string) => join(root, "tasks", created.slice(0, 7), `${id}.md`),
    /** What the brain's auto-commit stages; nothing else in the repo is touched. */
    commitPaths: ["projects", "knowledge", "tasks", "decisions.md"],
  };
}

const LINE = /^- (\d{4}-\d{2}-\d{2}) · (project|all) · (.+) \(from (w[1-9]\d*(?:\.[1-9]\d*)*)\)$/;

/** `- 2026-10-31 · project · theme preference lives in localStorage (from w12)` */
export function formatDecision(d: Decision): string {
  if (/\n/.test(d.text) || !d.text.trim()) throw new Error("a decision is one non-empty line");
  return `- ${d.date} · ${d.scope} · ${d.text.trim()} (from ${d.from})`;
}

export function parseDecision(line: string): Decision | null {
  const m = LINE.exec(line.trim());
  return m ? { date: m[1], scope: m[2] as Scope, text: m[3], from: m[4] } : null;
}
