// The knowledge contract. Read: private context for a run, chosen by the engine, never by the
// agent, as whole `##` sections with their source, within budget. Write: verified facts only.

import type { Fact } from "./facts";

export type Section = { source: string; heading: string; text: string };
export type ContextQuery = { folder: string; paths: string[]; goal: string; budget: number };

export type Recorded = { applied: string[]; skipped: string[] };

export interface Knowledge {
  context(q: ContextQuery): Section[];
  /** Append verified technical facts with their source run; never edits anything else. */
  record(facts: Fact[], o: { folder: string; source: string; date: string }): Promise<Recorded>;
}

const STOP = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "what", "why", "how", "does", "are", "use", "not", "its"]);

export function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
}

/** How many distinct query words a text contains. */
export function score(query: Set<string>, text: string): number {
  const t = tokens(text);
  let n = 0;
  for (const w of query) if (t.has(w)) n++;
  return n;
}

/** Split markdown into `##` sections; text before the first one is titled by its `#` heading. */
export function sections(source: string, md: string): Section[] {
  const out: Section[] = [];
  const parts = md.split(/^(?=## )/m);
  for (const part of parts) {
    const first = part.split("\n", 1)[0];
    const heading = first.startsWith("## ") ? first.slice(3).trim() : (first.match(/^# (.+)/)?.[1] ?? source);
    const text = part.trim();
    if (text) out.push({ source, heading, text });
  }
  return out;
}

/** Greedy fill: `must` first (cut to fit if needed), then the rest in order while they fit. */
export function fit(must: Section[], rest: Section[], budget: number): Section[] {
  const out: Section[] = [];
  let left = budget;
  for (const s of must) {
    if (left <= 20) break;
    const text = s.text.length <= left ? s.text : `${s.text.slice(0, left - 20)}\n… (cut)`;
    out.push({ ...s, text });
    left -= text.length;
  }
  for (const s of rest) {
    if (s.text.length > left) continue;
    out.push(s);
    left -= s.text.length;
  }
  return out;
}

export const noKnowledge: Knowledge = {
  context: () => [],
  record: async (facts) => ({ applied: [], skipped: facts.map((f) => `${f.text} (no knowledge base)`) }),
};
