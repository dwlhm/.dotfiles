// What finished steps left behind, read back from their run artifacts (report.md per run).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "./records";
import type { Finished } from "./plans";

const report = (state: string, run: string, max = Infinity) => {
  const f = join(state, "runs", run, "report.md");
  return existsSync(f) ? readFileSync(f, "utf8").slice(0, max) : "";
};

/** Finished steps (of `ids`, else all) with their result text. */
export function finishedOf(state: string, task: Task, ids?: string[]): Finished[] {
  return task.steps
    .filter((s) => s.status === "done" && (!ids || ids.includes(s.id)))
    .flatMap((step) => {
      const run = [...step.runs].reverse().find((r) => r.outcome === "done");
      return run && existsSync(join(state, "runs", run.id, "report.md")) ? [{ step, agent: run.runner, text: report(state, run.id) }] : [];
    });
}

/** What the given steps did: their results, and why earlier runs failed (where quirks show). */
export function evidenceOf(state: string, task: Task, ids: string[]): string {
  return task.steps
    .filter((s) => ids.includes(s.id))
    .map((s) => {
      const failed = s.runs.filter((r) => r.outcome === "fail" || r.outcome === "infra").map((r) => `- ${r.id} (${r.runner}·${r.model}) ${r.outcome}: ${report(state, r.id, 1500).trim() || r.summary}`);
      const done = [...s.runs].reverse().find((r) => r.outcome === "done");
      return [`### ${s.id}: ${s.title} (${s.status})`, done ? report(state, done.id, 1500).trim() : "", failed.length ? `Failed attempts:\n${failed.join("\n")}` : ""].filter(Boolean).join("\n\n");
    })
    .join("\n\n");
}
