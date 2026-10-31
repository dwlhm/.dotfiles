// Runner adapters: adapters/runners/<cli>/runner.md (facts) + runner.ts (code). One contract for
// every agent CLI; the engine derives which runners may serve a role and in what order.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readDoc, SpecError } from "./frontmatter";
import { Check } from "./check";
import type { Role, Spec } from "./spec";

export type LaunchInput = { model: string; prompt: string; cwd: string; can: string[]; check?: string };
export type Status = { state: string; kind?: string };
export type Launch = { argv: string[]; env?: Record<string, string> };

/** What runner.ts exports. */
export type RunnerCode = {
  /** The program for the terminal: prompt as the CLI's first message, permissions from `can`. */
  launch(i: LaunchInput): Launch;
  /**
   * Make sure the CLI trusts `cwd` before launch (runners whose runner.md says `trust: true`):
   * grant it per run when the CLI allows, else throw with the fix (the run becomes `infra`).
   */
  trust?(cwd: string): Promise<void>;
  /**
   * For CLIs whose only strict enforcement is a hook: `wf hook <runner>` passes the hook's stdin
   * and env; the return value is printed as the hook's reply ("" = no opinion).
   */
  hook?(input: string, env: Record<string, string | undefined>): string;
  /** Extra startup noise beyond the engine's rule (any status before the first `working`). */
  noise?(s: Status): boolean;
};

export type Model = { id: string; tier: string; cost: number };
/** `multiline`: whether the CLI runs a shell command spanning several lines (heredocs, quoted newlines). */
export type Runner = { name: string; enforces: string[]; multiline: boolean; trust: boolean; models: Model[]; code: RunnerCode };
export type Choice = { runner: Runner; model: Model };

export const adaptersDir = (): string => process.env.WF_ADAPTERS || join(import.meta.dir, "..", "adapters");

function loadModels(c: Check, d: Record<string, unknown>, spec: Spec): Model[] {
  const out: Model[] = [];
  (c.list(d, "models") ?? []).forEach((m, i) => {
    const mc = new Check(`${c.file}: models[${i}]`, c.errors);
    const o = (m ?? {}) as Record<string, unknown>;
    const model = { id: mc.text(o, "id"), tier: mc.oneOf(o, "tier", spec.vocab.tiers), cost: mc.int(o, "cost", 0) };
    if (model.id && model.tier && model.cost !== undefined) out.push(model as Model);
  });
  if (!out.length) c.fail("models", "must list at least one model");
  return out;
}

async function loadRunner(dir: string, spec: Spec, errors: string[]): Promise<Runner | undefined> {
  const name = dir.split("/").pop()!;
  const doc = readDoc(join(dir, "runner.md"));
  const c = new Check(doc.file, errors);
  if (doc.data.name !== name) c.fail("name", `must be the folder name '${name}'`);
  const enforces = c.names(doc.data, "enforces", spec.vocab.capabilities);
  const trust = c.flag(doc.data, "trust") ?? false;
  if (typeof doc.data.multiline !== "boolean") c.fail("multiline", "must say true or false: can the CLI run a multi-line shell command?");
  const multiline = doc.data.multiline === true;
  const models = loadModels(c, doc.data, spec);
  const codeFile = join(dir, "runner.ts");
  if (!existsSync(codeFile)) return c.fail("runner.ts", "is missing"), undefined;
  const code = (await import(codeFile)) as RunnerCode;
  if (typeof code.launch !== "function") c.fail("runner.ts", "must export launch()");
  if (trust && typeof code.trust !== "function") c.fail("runner.ts", "trust: true needs an exported trust()");
  return { name, enforces, multiline, trust, models, code };
}

export async function loadRunners(spec: Spec, root = adaptersDir()): Promise<Map<string, Runner>> {
  const errors: string[] = [];
  const out = new Map<string, Runner>();
  const base = join(root, "runners");
  for (const name of readdirSync(base).sort()) {
    try {
      const r = await loadRunner(join(base, name), spec, errors);
      if (r) out.set(r.name, r);
    } catch (e) {
      errors.push(e instanceof SpecError ? e.message : `${join(base, name)}: ${(e as Error).message}`);
    }
  }
  if (errors.length) throw new SpecError(errors.join("\n"));
  return out;
}

/**
 * Every runner+model that may serve `role`, cheapest first: the runner must enforce all of the
 * role's capabilities and the model's tier must be the role's or higher. `only` limits runners.
 */
export function choices(role: Role, runners: Map<string, Runner>, tiers: string[], only: string[] = []): Choice[] {
  const min = tiers.indexOf(role.tier);
  const out: (Choice & { rank: number })[] = [];
  for (const runner of runners.values()) {
    if (only.length && !only.includes(runner.name)) continue;
    if (!role.can.every((cap) => runner.enforces.includes(cap))) continue;
    for (const model of runner.models) {
      const t = tiers.indexOf(model.tier);
      if (t >= min) out.push({ runner, model, rank: (t - min) * 1000 + model.cost });
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ runner, model }) => ({ runner, model }));
}
