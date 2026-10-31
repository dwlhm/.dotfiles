// Knowledge adapter for the private brain repo (layout in engine/brain.ts).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { brainLayout } from "../../../engine/brain";
import { fit, score, sections, tokens, type Knowledge, type Section } from "../../../engine/knowledge";
import { recordFacts } from "./record";

/**
 * A knowledge section is included when it shares a word with the query itself and, counting a
 * match in its topic's title, at least MIN_SCORE words: the title ranks, it never qualifies alone.
 */
const MIN_SCORE = 2;

const expand = (p: string) => (p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");

/** `| \`~/.dotfiles\` | \`dotfiles.md\` |` rows → [path, file]. */
function projectRows(index: string): [string, string][] {
  return [...index.matchAll(/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm)].map((m) => [expand(m[1]), m[2]]);
}

/** `| Topic title | \`file.md\` |` rows → [title, file]. */
function topicRows(index: string): [string, string][] {
  return [...index.matchAll(/^\|\s*([^|`]+?)\s*\|\s*`([^`]+\.md)`\s*\|/gm)].map((m) => [m[1], m[2]]);
}

export function projectFor(root: string, folder: string): string | null {
  let best: [string, string] | null = null;
  for (const row of projectRows(read(brainLayout(root).projectsIndex))) {
    const inside = folder === row[0] || folder.startsWith(row[0].replace(/\/$/, "") + "/");
    if (inside && (!best || row[0].length > best[0].length)) best = row;
  }
  return best ? best[1] : null;
}

export function brainKnowledge(root: string): Knowledge {
  const layout = brainLayout(root);
  return {
    record: (facts, o) => recordFacts(root, projectFor(root, o.folder), facts, o),
    context({ folder, paths, goal, budget }) {
      const query = tokens([goal, ...paths, folder.split("/").pop() ?? ""].join(" "));
      const must: Section[] = [];
      const ranked: [number, Section][] = [];
      const project = projectFor(root, folder);
      if (project) {
        for (const s of sections(`projects/${project}`, read(layout.projectFile(project)))) {
          if (/invariant/i.test(s.heading)) must.push(s);
          else ranked.push([score(query, s.text), s]);
        }
      }
      for (const [title, file] of topicRows(read(layout.knowledgeIndex))) {
        const bonus = score(query, title);
        for (const s of sections(`knowledge/${file}`, read(join(root, "knowledge", file)))) {
          const own = score(query, s.text);
          if (own > 0 && own + bonus >= MIN_SCORE) ranked.push([own + bonus, s]);
        }
      }
      const rest = ranked.filter(([n, s]) => n > 0 || s.source.startsWith("projects/")).sort((a, b) => b[0] - a[0]).map(([, s]) => s);
      return fit(must, rest, budget);
    },
  };
}
