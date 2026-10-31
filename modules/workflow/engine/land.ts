// What happens after a worker says a patch step is done. The engine checks, never the agent:
// scope, the step's check, commit, leak check, then merge into the integration branch.
import { join, relative } from "node:path";
import { realpathSync } from "node:fs";
import { integrationWorktree } from "./patch";
import type { Spec } from "./spec";
import type { Step, Task } from "./records";
import { changed, cleanup, commitAll, diffSince, mergeInto, outside } from "./repo";
import { runCheck } from "./checks";
import { leaks } from "./leak";
import { actions, touchesUi } from "./rules";
import type { Exec } from "./exec";

/** `fail`: the worker gets another try with `reason` as feedback; `blocked`: a person decides. */
export type Landed = { ok: true; text: string } | { ok: false; outcome: "fail" | "blocked"; reason: string };

export type LandInput = { spec: Spec; task: Task; step: Step; state: string; context: string; x?: Exec };

async function verify(i: LandInput, wt: string): Promise<Landed | { files: string[] }> {
  const files = await changed(wt, i.x);
  if (!files.length) return { ok: false, outcome: "fail", reason: "No file was changed. Make the change itself, then report done." };
  const out = outside(files, i.step.only);
  if (out.length) return { ok: false, outcome: "fail", reason: `Changed files outside the allowed paths (${i.step.only.join(", ")}): ${out.join(", ")}. Undo those and keep to the allowed paths.` };
  // The check runs where the worker worked: the task's folder, inside the worktree.
  const cwd = join(wt, relative(i.task.options.root as string, realpathSync(i.task.folder)));
  const r = await runCheck(i.step.check!, cwd, i.spec.policy.limits.check_minutes, i.x);
  if (!r.passed) return { ok: false, outcome: "fail", reason: `The check \`${i.step.check}\` failed (run by wf, not by you):\n${r.tail}` };
  return { files };
}

export async function land(i: LandInput): Promise<Landed> {
  const { spec, task, step } = i;
  const root = task.options.root as string;
  const base = step.base ?? (task.options.base as string);
  const wt = step.worktree!;
  const v = await verify(i, wt);
  if (!("files" in v)) return v;
  const commit = await commitAll(wt, `wf ${step.id}: ${step.title}`, i.x);
  const acts = actions(spec, { edits_code: true, touches_ui: touchesUi(spec, v.files), result_patch: true, large_task: false });
  if (acts.has("leak_check")) {
    const copied = leaks(await diffSince(wt, base, i.x), i.context);
    if (copied.length) return { ok: false, outcome: "fail", reason: `The patch copies private reference text (never copy it into files):\n${copied.map((l) => `- ${l}`).join("\n")}\nRemove those lines.` };
  }
  const notes = acts.has("add_qa_step") ? ["UI files changed, but UI test flows are not run yet (qa steps come with `build`)."] : [];
  const summary = `Changed ${v.files.join(", ")} (commit ${commit}); \`${step.check}\` passed.`;
  if (!acts.has("merge_into_integration") || task.options["no-merge"]) {
    return { ok: true, text: [`${summary} Left on branch ${step.branch} (${wt}); not merged.`, ...notes].join("\n") };
  }
  const into = spec.policy.integration_branch;
  const intWt = await integrationWorktree(spec, i.state, root, base, i.x);
  const m = await mergeInto(intWt, step.branch!, `wf ${step.id}: merge ${step.title}`, i.x);
  if ("conflicts" in m) return { ok: false, outcome: "blocked", reason: `${step.branch} conflicts with ${into} in: ${m.conflicts.join(", ")}. The branch is kept; resolve it or drop the step.` };
  await cleanup(root, wt, step.branch!, into, i.x);
  return { ok: true, text: [`${summary} Merged into ${into} (${m.commit}).`, ...notes].join("\n") };
}
