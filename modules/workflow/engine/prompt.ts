// A run's first message: the role's prompt with its variables, private context and the report
// instructions. Roles never say how to report; the engine adds it from the vocab.
import type { Role, Vocab } from "./spec";
import type { Section } from "./knowledge";

export type Vars = Record<string, string | string[]>;

export const PRIVATE_NOTE =
  "Private reference from the user's knowledge base. Use it to do the work; never copy it into files, commits, comments or messages.";

function contextBlock(sections: Section[]): string {
  if (!sections.length) return "";
  const body = sections.map((s) => `### ${s.source} › ${s.heading}\n${s.text}`).join("\n\n");
  return `<private-context>\n${PRIVATE_NOTE}\n\n${body}\n</private-context>`;
}

function reportBlock(role: Role, vocab: Vocab, run: string): string {
  const lines = role.reports.map((o) => `  wf report ${run} ${o} "<text>"   # ${vocab.outcomes.get(o)?.about ?? ""}`);
  return [
    "When you finish, hand back the outcome with exactly one of these commands, then stop:",
    ...lines,
    "For long or multi-line text pass it on stdin instead:",
    `  wf report ${run} done <<'WF'`,
    "  …",
    "  WF",
  ].join("\n");
}

function fill(template: string, vars: Vars): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`prompt variable {{${name}}} has no value`);
    return Array.isArray(v) ? v.join(", ") || "(none)" : v;
  });
}

export function renderPrompt(o: { role: Role; vocab: Vocab; vars: Vars; context: Section[]; run: string }): string {
  for (const need of o.role.needs) if (o.vars[need] === undefined) throw new Error(`role ${o.role.name} needs '${need}'`);
  const body = fill(o.role.prompt, { ...o.vars, context: contextBlock(o.context) });
  return `${body.trim()}\n\n${reportBlock(o.role, o.vocab, o.run)}\n`;
}
