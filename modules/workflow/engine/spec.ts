// Loads spec/ (vocab, policy, commands, roles) and checks every cross-reference against the vocab.
import { readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { readDoc, SpecError, type Doc } from "./frontmatter";
import { Check } from "./check";
import { loadPolicy, type Policy } from "./policy";
import { loadCommands, type Command, type Option } from "./commands";

export type Vocab = {
  capabilities: Set<string>;
  outcomes: Map<string, "agent" | "engine">;
  tiers: string[];
  results: Set<string>;
  predicates: Set<string>;
  actions: Set<string>;
};

export type Role = {
  name: string;
  description: string;
  tier: string;
  can: string[];
  needs: string[];
  reports: string[];
  prompt: string;
};

export type Spec = {
  vocab: Vocab;
  policy: Policy;
  commands: Map<string, Command>;
  options: Map<string, Option>;
  roles: Map<string, Role>;
};

/** Filled by the engine for every role, so a prompt may use it without listing it in `needs`. */
export const ENGINE_VARS = ["context"];

const keys = (c: Check, doc: Doc, field: string) => new Set(Object.keys(c.map(doc.data, field) ?? {}));

function loadVocab(doc: Doc, c: Check): Vocab {
  const outcomes = new Map<string, "agent" | "engine">();
  for (const [name, v] of Object.entries(c.map(doc.data, "outcomes") ?? {})) {
    const by = (v as Record<string, unknown>)?.by;
    if (by !== "agent" && by !== "engine") c.fail(`outcomes.${name}.by`, "must be agent or engine");
    else outcomes.set(name, by);
  }
  const tiers = (c.list(doc.data, "tiers") ?? []).filter((t): t is string => typeof t === "string");
  return {
    capabilities: keys(c, doc, "capabilities"),
    outcomes,
    tiers,
    results: keys(c, doc, "results"),
    predicates: keys(c, doc, "predicates"),
    actions: keys(c, doc, "actions"),
  };
}

function loadRole(doc: Doc, vocab: Vocab): { role: Role; errors: string[] } {
  const c = new Check(doc.file);
  const d = doc.data;
  const reports = c.names(d, "reports", vocab.outcomes.keys());
  for (const r of reports) if (vocab.outcomes.get(r) === "engine") c.fail("reports", `'${r}' is reported by the engine, never by an agent`);
  const can = c.names(d, "can", vocab.capabilities);
  if (!can.includes("shell-report")) c.fail("can", "every role needs shell-report to hand back its outcome");
  const needs = c.words(d, "needs");
  for (const v of promptVars(doc.body)) {
    if (!needs.includes(v) && !ENGINE_VARS.includes(v)) c.fail("body", `{{${v}}} is not in needs (${needs.join(", ") || "none"})`);
  }
  if (!doc.body) c.fail("body", "the prompt is empty");
  const role: Role = {
    name: basename(doc.file, ".md"),
    description: c.text(d, "description") ?? "",
    tier: c.oneOf(d, "tier", vocab.tiers) ?? "",
    can,
    needs,
    reports,
    prompt: doc.body,
  };
  return { role, errors: c.errors };
}

export function promptVars(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))];
}

function read(file: string, errors: string[]): Doc | undefined {
  try {
    return readDoc(file);
  } catch (e) {
    errors.push(e instanceof SpecError ? e.message : `${file}: ${(e as Error).message}`);
    return undefined;
  }
}

/** Every problem in the spec at once; throws SpecError listing them when there is any. */
export function loadSpec(dir: string): Spec {
  const errors: string[] = [];
  const vocabDoc = read(join(dir, "vocab.md"), errors);
  if (!vocabDoc) throw new SpecError(errors.join("\n"));
  const vc = new Check(vocabDoc.file);
  const vocab = loadVocab(vocabDoc, vc);
  errors.push(...vc.errors);

  const roles = new Map<string, Role>();
  const roleDir = join(dir, "roles");
  for (const f of readdirSync(roleDir).filter((f) => f.endsWith(".md")).sort()) {
    const doc = read(join(roleDir, f), errors);
    if (!doc) continue;
    const r = loadRole(doc, vocab);
    roles.set(r.role.name, r.role);
    errors.push(...r.errors);
  }
  const policy = withDoc(join(dir, "policy.md"), errors, (d) => loadPolicy(d, vocab));
  const cmds = withDoc(join(dir, "commands.md"), errors, (d) => loadCommands(d, vocab, roles));
  if (errors.length || !policy || !cmds) throw new SpecError(errors.join("\n"));
  return { vocab, policy, commands: cmds.commands, options: cmds.options, roles };
}

function withDoc<T>(file: string, errors: string[], load: (d: Doc) => { value: T; errors: string[] }): T | undefined {
  const doc = read(file, errors);
  if (!doc) return undefined;
  const r = load(doc);
  errors.push(...r.errors);
  return r.value;
}
