// What finished steps left behind, read back from their run artifacts (report.md per run).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Step, Task } from "./records";
import { ended, flat } from "./steps";
import type { Finished } from "./plans";

const report = (state: string, run: string, max = Infinity) => {
  const f = join(state, "runs", run, "report.md");
  return existsSync(f) ? readFileSync(f, "utf8").slice(0, max) : "";
};

/** A finished step's result text; a split step's is its sub-steps' results. */
function resultText(state: string, step: Step): { agent: string; text: string } | null {
  if (step.status === "split") {
    if (ended(step) !== "done") return null;
    const parts = step.steps.map((s) => `### ${s.id}: ${s.title}\n${resultText(state, s)?.text.trim() ?? ""}`);
    return { agent: "split", text: parts.join("\n\n") };
  }
  const run = [...step.runs].reverse().find((r) => r.outcome === "done");
  return step.status === "done" && run && existsSync(join(state, "runs", run.id, "report.md")) ? { agent: run.runner, text: report(state, run.id) } : null;
}

/** Finished steps (of `ids`, else all, at any depth) with their result text. */
export function finishedOf(state: string, task: Task, ids?: string[]): Finished[] {
  return flat(task.steps)
    .filter((s) => !ids || ids.includes(s.id))
    .flatMap((step) => {
      const r = resultText(state, step);
      return r ? [{ step, ...r }] : [];
    });
}

/** What the given steps did: their results, and why earlier runs failed (where quirks show). */
export function evidenceOf(state: string, task: Task, ids: string[]): string {
  const wanted = flat(task.steps.filter((s) => ids.includes(s.id))).filter((s) => s.status !== "split");
  return wanted
    .map((s) => {
      const failed = s.runs.filter((r) => r.outcome === "fail" || r.outcome === "infra").map((r) => `- ${r.id} (${r.runner}·${r.model}) ${r.outcome}: ${report(state, r.id, 1500).trim() || r.summary}`);
      const done = [...s.runs].reverse().find((r) => r.outcome === "done");
      return [`### ${s.id}: ${s.title} (${s.status})`, done ? report(state, done.id, 1500).trim() : "", failed.length ? `Failed attempts:\n${failed.join("\n")}` : ""].filter(Boolean).join("\n\n");
    })
    .join("\n\n");
}
