// An agent's report, as the board keeps it: a one-sentence headline the card shows, Markdown
// detail the dialog shows, and for a question the choices the person can answer with in one click.
// Agents are asked for that shape (`--detail`, `--option`); free text from an agent that ignores it,
// or from a task saved before reports had a shape, goes through the same parser.

export const REPORTS = { done: "done", failed: "failed", question: "waiting", stuck: "waiting", plan: "waiting" } as const;
export type ReportStatus = keyof typeof REPORTS;
export const isReportStatus = (s: string): s is ReportStatus => s in REPORTS;

export interface Report {
  status: ReportStatus;
  /** One sentence: the question to answer, or the result. */
  headline: string;
  /** Markdown: context, what changed, what was checked. */
  detail: string;
  /** Answers the person can pick; the first is the agent's recommendation. */
  options: string[];
  at: number;
}

const LIST = /^\s*([-*+]|\d+[.)])\s/;
const INLINE_STEP = /(^|\s)(\d+)\)\s/g;
/** Past this a headline is cut at its first sentence; the rest leads the detail. */
const HEADLINE_MAX = 120;
const FENCE = /^\s*(```|~~~)/;

/** `**Plan:**` → `Plan:`: a headline is shown as plain text. */
const plain = (line: string) => line.trim().replace(/^#+\s*/, "").replace(/^(\*\*|__)(.*)\1$/, "$2").trim();

/** Free text → Markdown that renders the way it was typed: `1)` lists become Markdown lists, and
 *  a lone line break starts a new paragraph instead of joining two lines (code fences are kept). */
export function formatDetail(text: string): string {
  const out: string[] = [];
  let fenced = false;
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n")
    .flatMap((l) => ((l.match(INLINE_STEP)?.length ?? 0) >= 2 && !FENCE.test(l) ? l.replace(INLINE_STEP, "\n$2. ").split("\n").filter((x, i) => i > 0 || x.trim()) : [l]));
  for (const raw of lines) {
    const line = fenced ? raw : raw.replace(/^(\s*\d+)\)\s/, "$1. ").trimEnd();
    const prev = out.at(-1);
    const joined = fenced || prev === undefined || prev === "" || line === "" || (LIST.test(line) && LIST.test(prev)) || /^\s{2,}\S/.test(line);
    if (!joined) out.push("");
    out.push(line);
    if (FENCE.test(raw)) fenced = !fenced;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Index of the first `.`, `!` or `?` that ends a sentence outside brackets, or -1. */
function sentenceEnd(line: string): number {
  let depth = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (depth === 0 && ".!?".includes(c) && line[i + 1] === " ") return i;
  }
  return -1;
}

/** Splits free text into headline and detail. A question's headline is its first line that asks
 *  something, so a question buried after a plan still leads. */
function split(status: ReportStatus, text: string): [string, string] {
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return ["", ""];
  const asks = status === "question" && !plain(lines[first]).endsWith("?")
    ? lines.findIndex((l) => !LIST.test(l) && plain(l).endsWith("?"))
    : -1;
  const at = asks >= 0 ? asks : first;
  const rest = lines.filter((_, i) => i !== at).join("\n");
  const line = plain(lines[at]);
  const cut = line.length > HEADLINE_MAX ? sentenceEnd(line) : -1;
  if (cut < 0) return [line, rest];
  return [line.slice(0, cut + 1), `${line.slice(cut + 1).trim()}\n${rest}`];
}

export function parseReport(status: ReportStatus, text: string, at: number, opts: { detail?: string; options?: string[] } = {}): Report {
  const [headline, rest] = split(status, text);
  if (!headline) throw new Error("a report needs a summary");
  const detail = [rest, opts.detail ?? ""].map(formatDetail).filter(Boolean).join("\n\n");
  const options = [...new Set((opts.options ?? []).map((o) => o.trim()).filter(Boolean))];
  return { status, headline, detail, options, at };
}

/** The report as text for an agent: what a creator's agent reads when a sub-task hands back. */
export function reportText(r: Report): string {
  const options = r.options.map((o, i) => `${i + 1}. ${o}${i === 0 ? " (recommended)" : ""}`);
  return [r.headline, r.detail, options.length ? `Options:\n${options.join("\n")}` : ""].filter(Boolean).join("\n\n");
}
