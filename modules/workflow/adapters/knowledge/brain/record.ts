// Writing verified facts into the brain: appended to a facts section or a topic file, never
// editing anything else (Core Invariants and the rest stay as the user wrote them).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brainLayout } from "../../../engine/brain";
import { commitSnapshot } from "../../../engine/gitsnap";
import type { Fact } from "../../../engine/facts";
import type { Recorded } from "../../../engine/knowledge";

export const FACTS_HEADING = "## Verified facts (wf)";

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");

/** Append `bullet` at the end of the `heading` section, adding the section at the end if missing. */
export function appendUnder(md: string, heading: string, bullet: string): string {
  const i = md.indexOf(`${heading}\n`);
  if (i < 0) return `${md.trimEnd()}\n\n${heading}\n\n${bullet}\n`;
  const next = md.indexOf("\n## ", i + heading.length);
  const end = next < 0 ? md.length : next;
  return `${md.slice(0, end).trimEnd()}\n${bullet}\n${next < 0 ? "" : `\n${md.slice(end + 1)}`}`;
}

/** Register a new topic in the knowledge index table (after its last row). */
export function registerTopic(index: string, topic: string): string {
  const row = `| ${topic} (from wf) | \`${topic}.md\` |`;
  const rows = [...index.matchAll(/^\|.*\|$/gm)];
  if (!rows.length) return `${index.trimEnd()}\n\n| Topic | File |\n|---|---|\n${row}\n`;
  const last = rows[rows.length - 1];
  const at = last.index! + last[0].length;
  return `${index.slice(0, at)}\n${row}${index.slice(at)}`;
}

export async function recordFacts(root: string, project: string | null, facts: Fact[], o: { source: string; date: string }): Promise<Recorded> {
  const layout = brainLayout(root);
  const files = new Map<string, string>();
  const get = (f: string) => files.get(f) ?? read(f);
  const out: Recorded = { applied: [], skipped: [] };
  for (const f of facts) {
    const file = f.scope === "project" ? (project ? layout.projectFile(project) : null) : join(root, "knowledge", `${f.topic}.md`);
    if (!file) {
      out.skipped.push(`${f.text} (no project file for this folder)`);
      continue;
    }
    const md = get(file) || `# ${f.topic}\n`;
    if (norm(md).includes(norm(f.text))) {
      out.skipped.push(`${f.text} (already known)`);
      continue;
    }
    if (f.scope === "topic" && !existsSync(file) && !files.has(file)) files.set(layout.knowledgeIndex, registerTopic(get(layout.knowledgeIndex), f.topic!));
    files.set(file, f.scope === "project" ? appendUnder(md, FACTS_HEADING, bullet(f, o)) : `${md.trimEnd()}\n${bullet(f, o)}\n`);
    out.applied.push(`${file.slice(root.length + 1)}: ${f.text}`);
  }
  for (const [file, text] of files) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, text);
    renameSync(`${file}.tmp`, file);
  }
  if (files.size && existsSync(join(root, ".git"))) {
    const rels = [...files].map(([file, content]) => ({ rel: file.slice(root.length + 1), content }));
    await commitSnapshot(root, rels, `docs(brain): wf ${o.source} facts`);
  }
  return out;
}

const bullet = (f: Fact, o: { source: string; date: string }) => `- ${f.text} (verified ${o.date}, ${o.source})`;
