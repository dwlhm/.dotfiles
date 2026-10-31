// spec/policy.md: rules (predicate → actions) and the limits the engine enforces on every task.
import type { Doc } from "./frontmatter";
import { Check } from "./check";
import type { Vocab } from "./spec";

export type Rule = { when: string; then: string[] };
export type Limits = {
  small_task_steps: number;
  plan_depth: number;
  steps_per_level: number;
  retries_per_tier: number;
  context_bytes: number;
  start_seconds: number;
  run_minutes: number;
  check_minutes: number;
};
export type Policy = { rules: Rule[]; ui_globs: string[]; limits: Limits; integration_branch: string };

const LIMITS: (keyof Limits)[] = [
  "small_task_steps",
  "plan_depth",
  "steps_per_level",
  "retries_per_tier",
  "context_bytes",
  "start_seconds",
  "run_minutes",
  "check_minutes",
];

function loadRules(c: Check, d: Record<string, unknown>, vocab: Vocab): Rule[] {
  const rules: Rule[] = [];
  (c.list(d, "rules") ?? []).forEach((r, i) => {
    if (r === null || typeof r !== "object") return c.fail(`rules[${i}]`, "must be { when, then }");
    const rc = new Check(`${c.file}: rules[${i}]`);
    const rule = { when: rc.oneOf(r as Record<string, unknown>, "when", vocab.predicates), then: rc.names(r as Record<string, unknown>, "then", vocab.actions) };
    if (!rule.then.length) rc.fail("then", "must name at least one action");
    c.errors.push(...rc.errors);
    if (rule.when) rules.push({ when: rule.when, then: rule.then });
  });
  return rules;
}

export function loadPolicy(doc: Doc, vocab: Vocab): { value: Policy; errors: string[] } {
  const c = new Check(doc.file);
  const d = doc.data;
  const rules = loadRules(c, d, vocab);
  const ui_globs = (c.list(d, "ui_globs") ?? []).filter((g): g is string => typeof g === "string" && g !== "");
  const lim = c.map(d, "limits") ?? {};
  const limits = Object.fromEntries(LIMITS.map((k) => [k, c.int(lim, k, k === "retries_per_tier" ? 0 : 1) ?? 0])) as Limits;
  const integration_branch = c.text(d, "integration_branch") ?? "";
  if (integration_branch && /\s|\.\.|^-|^main$|^master$/.test(integration_branch)) {
    c.fail("integration_branch", `'${integration_branch}' is not a safe branch name (never main/master)`);
  }
  return { value: { rules, ui_globs, limits, integration_branch }, errors: c.errors };
}
