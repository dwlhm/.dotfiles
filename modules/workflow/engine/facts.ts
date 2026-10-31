// The curate role's report, parsed. Anything that is not exactly an entry is dropped and counted:
// a vague report never turns into knowledge by being half-understood.
export type Fact = { scope: "project" | "topic"; topic?: string; text: string };

const PROJECT = /^project:\s*(.+)$/i;
const TOPIC = /^topic\s+([a-z0-9][a-z0-9-]{0,30}):\s*(.+)$/i;

export function parseFacts(report: string): { facts: Fact[]; dropped: number } {
  const lines = report.split("\n").map((l) => l.trim().replace(/^[-*]\s+/, "")).filter(Boolean);
  if (lines.length === 1 && /^`?nothing`?\.?$/i.test(lines[0])) return { facts: [], dropped: 0 };
  const facts: Fact[] = [];
  let dropped = 0;
  for (const line of lines) {
    const p = PROJECT.exec(line);
    const t = TOPIC.exec(line);
    if (p) facts.push({ scope: "project", text: p[1].trim() });
    else if (t) facts.push({ scope: "topic", topic: t[1].toLowerCase(), text: t[2].trim() });
    else dropped++;
  }
  return { facts, dropped };
}
