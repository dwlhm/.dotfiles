// spec/policy.md rules applied to one step: which actions the engine must take. The spec says
// what; this only evaluates its predicates, so a new rule needs no engine change.
import type { Spec } from "./spec";

export type Facts = { edits_code: boolean; touches_ui: boolean; result_patch: boolean; large_task: boolean };

export function actions(spec: Spec, facts: Facts): Set<string> {
  const out = new Set<string>();
  for (const r of spec.policy.rules) if (facts[r.when as keyof Facts]) r.then.forEach((a) => out.add(a));
  return out;
}

/** Whether any path matches one of the policy's UI globs. */
export function touchesUi(spec: Spec, paths: string[]): boolean {
  const globs = spec.policy.ui_globs.map((g) => new Bun.Glob(g));
  return paths.some((p) => globs.some((g) => g.match(p)));
}
