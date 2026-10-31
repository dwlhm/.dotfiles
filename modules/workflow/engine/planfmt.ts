// The plan a planner (or a worker splitting a step) reports, parsed and checked against the
// policy. Pure. Errors are phrased for the planner: they come back to it as feedback.
import type { Limits } from "./policy";

export type PlanStep = { title: string; only: string[]; check: string; after: number[]; qa?: string };
export type Plan = { steps: PlanStep[]; later?: string };

const FIELD = /^(step|only|check|after|qa|later):\s*(.*)$/i;

export function parsePlan(text: string): { plan: Plan } | { error: string } {
  const steps: PlanStep[] = [];
  let later: string | undefined;
  let cur: Partial<PlanStep> | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^[-*]\s+/, "");
    if (!line || /^```/.test(line)) continue;
    const m = FIELD.exec(line);
    if (!m) return { error: `cannot read this line of the plan: "${line.slice(0, 120)}"` };
    const [key, value] = [m[1].toLowerCase(), m[2].trim()];
    if (key === "later") later = value;
    else if (key === "step") steps.push((cur = { title: value, only: [], after: [] }) as PlanStep);
    else if (!cur) return { error: `"${key}:" comes before any "step:"` };
    else if (key === "only") cur.only = value.split(",").map((p) => p.trim()).filter(Boolean);
    else if (key === "after") cur.after = value.split(",").map((n) => Number(n.trim())).filter((n) => !Number.isNaN(n));
    else if (key === "check") cur.check = value.replace(/^`|`$/g, "");
    else cur.qa = value.replace(/^`|`$/g, "");
  }
  if (!steps.length) return { error: "the plan has no step" };
  return { plan: { steps, ...(later ? { later } : {}) } };
}

/** The static part of a path or glob, as a folder prefix ("src/**" → "src", "a/b.ts" → "a/b.ts"). */
const stem = (p: string) => p.replace(/^\.\//, "").split(/[*?[{]/)[0].replace(/\/+$/, "") || ".";
const overlaps = (a: string, b: string) => a === "." || b === "." || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

/** Steps i and j can run at the same time when neither needs the other, directly or not. */
function independent(steps: PlanStep[]): [number, number][] {
  const needs = (i: number, j: number, seen = new Set<number>()): boolean =>
    steps[i].after.some((d) => d - 1 === j || (!seen.has(d) && (seen.add(d), needs(d - 1, j, seen))));
  const out: [number, number][] = [];
  for (let i = 0; i < steps.length; i++) for (let j = i + 1; j < steps.length; j++) if (!needs(j, i) && !needs(i, j)) out.push([i, j]);
  return out;
}

export function checkPlan(plan: Plan, limits: Limits): string[] {
  const errors: string[] = [];
  const { steps } = plan;
  if (steps.length > limits.steps_per_level) errors.push(`${steps.length} steps; at most ${limits.steps_per_level} — merge steps or move the rest to "later:"`);
  steps.forEach((s, i) => {
    const n = i + 1;
    if (!s.title) errors.push(`step ${n} has no outcome`);
    if (!s.only.length) errors.push(`step ${n} ("${s.title}") has no "only:" paths`);
    if (!s.check) errors.push(`step ${n} ("${s.title}") has no "check:"`);
    for (const d of s.after) if (!Number.isInteger(d) || d < 1 || d >= n) errors.push(`step ${n} comes after ${d}, which is not an earlier step`);
  });
  if (errors.length) return errors;
  for (const [i, j] of independent(steps)) {
    for (const a of steps[i].only) for (const b of steps[j].only) {
      if (overlaps(stem(a), stem(b))) errors.push(`steps ${i + 1} and ${j + 1} can run at the same time but both may edit ${stem(a) === "." ? "everything" : stem(a)}; separate their paths or order them with "after:"`);
    }
  }
  return [...new Set(errors)];
}

/** How the plan reads to the user, for approval. */
export function showPlan(plan: Plan): string {
  const lines = plan.steps.map((s, i) => {
    const after = s.after.length ? `, after ${s.after.join(", ")}` : "";
    return `${i + 1}. ${s.title}\n   only: ${s.only.join(", ")} · check: ${s.check}${after}${s.qa ? ` · qa: ${s.qa}` : ""}`;
  });
  return [...lines, ...(plan.later ? [`later: ${plan.later}`] : [])].join("\n");
}
