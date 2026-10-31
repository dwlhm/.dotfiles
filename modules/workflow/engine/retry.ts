// Which run comes next for a step. Infra (the runner broke) moves to a choice not tried yet; a
// quality failure (the check or the scope failed) retries the same choice up to retries_per_tier
// times, then moves up one tier. Pure: choices are cheapest first, tiers ordered low to high.
import type { Choice } from "./runners";
import type { Run } from "./records";

const key = (runner: string, model: string) => `${runner} ${model}`;

export function nextChoice(choices: Choice[], runs: Run[], tiers: string[], retries: number): Choice | undefined {
  const last = runs.at(-1);
  const tried = new Set(runs.map((r) => key(r.runner, r.model)));
  const untried = choices.filter((c) => !tried.has(key(c.runner.name, c.model.id)));
  if (!last || last.outcome !== "fail") return untried[0];
  const same = choices.find((c) => key(c.runner.name, c.model.id) === key(last.runner, last.model));
  const tier = tiers.indexOf(same?.model.tier ?? "");
  const failsHere = runs.filter((r) => r.outcome === "fail" && choices.some((c) => key(c.runner.name, c.model.id) === key(r.runner, r.model) && tiers.indexOf(c.model.tier) === tier)).length;
  if (same && failsHere <= retries) return same;
  return choices.find((c) => tiers.indexOf(c.model.tier) > tier);
}
