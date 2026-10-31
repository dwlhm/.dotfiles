// leak_check: a patch must not copy the private knowledge injected into its run. A long line of
// the context appearing inside any added line of the diff (whitespace normalized, so a comment
// marker or indentation does not hide it) is a leak. Short lines are too generic to tell, and a
// copy of part of a line is not caught: a heuristic against accidents, not a guarantee.
export const LEAK_MIN = 40;

const norm = (l: string) => l.trim().replace(/\s+/g, " ");

/** Context lines (normalized) found inside the patch's added lines. */
export function leaks(diff: string, context: string): string[] {
  const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => norm(l.slice(1)));
  const found = new Set<string>();
  for (const line of context.split("\n").map(norm)) {
    if (line.length >= LEAK_MIN && added.some((a) => a.includes(line))) found.add(line);
  }
  return [...found];
}
