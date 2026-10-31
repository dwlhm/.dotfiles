// Markdown with a YAML frontmatter block: the one file format of every spec file and record.
import { readFileSync } from "node:fs";

export type Doc = { file: string; data: Record<string, unknown>; body: string };

export class SpecError extends Error {}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseDoc(file: string, text: string): Doc {
  const m = FENCE.exec(text);
  if (!m) throw new SpecError(`${file}: missing frontmatter (--- … ---) at the top`);
  let data: unknown;
  try {
    data = Bun.YAML.parse(m[1]);
  } catch (e) {
    throw new SpecError(`${file}: invalid YAML frontmatter: ${(e as Error).message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new SpecError(`${file}: frontmatter must be a mapping of fields`);
  }
  return { file, data: data as Record<string, unknown>, body: m[2].trim() };
}

export function readDoc(file: string): Doc {
  return parseDoc(file, readFileSync(file, "utf8"));
}

export function renderDoc(data: Record<string, unknown>, body: string): string {
  return `---\n${Bun.YAML.stringify(data, null, 2).trimEnd()}\n---\n\n${body.trim()}\n`;
}
