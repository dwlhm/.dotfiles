// A worker reporting `too_big`: its proposed sub-steps (the plan format) replace the step's own
// work. Checked like a plan, kept inside the step's paths, and never deeper than plan_depth.
import type { Engine } from "./engine";
import type { Active } from "./types";
import type { Step } from "./records";
import { checkPlan, parsePlan } from "./planfmt";
import { assignBranches, normalizeOnly } from "./patch";
import { dropIfEmpty, outside, unknownPaths } from "./repo";
import { depth } from "./steps";

export type Split = { ok: true; text: string } | { ok: false; outcome: "fail" | "blocked"; reason: string };

const stem = (p: string) => p.split(/[*?[{]/)[0].replace(/\/+$/, "") || ".";

export async function splitStep(e: Engine, a: Active, report: string): Promise<Split> {
  const { task, step } = a;
  const limit = e.d.spec.policy.limits.plan_depth;
  if (depth(step.id) + 1 > limit) {
    return { ok: false, outcome: "blocked", reason: `${step.id} needs splitting again, deeper than plan_depth ${limit}: the goal needs rethinking with you. Its proposal:\n${report.trim()}` };
  }
  const parsed = parsePlan(report);
  if ("error" in parsed) return { ok: false, outcome: "fail", reason: `The sub-steps could not be read: ${parsed.error}. Report too_big again in exactly the plan block format.` };
  const root = task.options.root as string;
  const subs = parsed.plan.steps.map((p) => ({ ...p, only: normalizeOnly(root, task.folder, p.only) }));
  const errors = checkPlan({ steps: subs }, e.d.spec.policy.limits);
  const wrong = unknownPaths(root, subs.flatMap((p) => p.only));
  if (wrong.length) errors.push(`these paths do not exist under ${task.folder}: ${wrong.join(", ")} (write them relative to it)`);
  for (const [i, p] of subs.entries()) {
    const out = outside(p.only.map(stem), step.only);
    if (out.length) errors.push(`sub-step ${i + 1} may edit ${out.join(", ")}, outside this step's paths (${step.only.join(", ")})`);
    if (p.qa) errors.push(`sub-step ${i + 1} names a qa test; UI tests belong in the task's plan`);
  }
  if (parsed.plan.later) errors.push(`"later:" belongs in the task's plan; split only this step`);
  if (errors.length) return { ok: false, outcome: "fail", reason: `The sub-steps break these rules:\n${errors.map((x) => `- ${x}`).join("\n")}` };
  const children: Step[] = subs.map((p, i) => ({
    id: `${step.id}.${i + 1}`, title: p.title, role: step.role, only: p.only, check: p.check,
    deps: p.after.map((d) => `${step.id}.${d}`), status: "queued", runs: [], steps: [],
    // Without deps a sub-step starts where its step did; after a sibling, from integration (workdir).
    ...(step.base && !p.after.length ? { base: step.base } : {}),
  }));
  await assignBranches(e.d.spec, children, root, e.d.state, e.d.exec);
  await dropIfEmpty(root, step.worktree!, step.branch!, step.base ?? (task.options.base as string), e.d.exec);
  step.status = "split";
  step.steps = children;
  return { ok: true, text: `Split into ${children.length} sub-steps:\n${children.map((c) => `- ${c.id}: ${c.title}`).join("\n")}` };
}
