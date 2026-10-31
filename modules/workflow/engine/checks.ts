// A step's check: the command whose passing proves the work. Guessed from the repo only when the
// guess is unambiguous and runnable; otherwise the user is asked to name it. Run by the engine.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exec, type Exec } from "./exec";

const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");

function nodeCheck(folder: string): string | null {
  const pkg = read(join(folder, "package.json"));
  if (!pkg) return null;
  let test: unknown;
  try {
    test = JSON.parse(pkg).scripts?.test;
  } catch {
    return null;
  }
  if (typeof test !== "string" || /no test specified/.test(test)) return null;
  if (existsSync(join(folder, "bun.lock")) || existsSync(join(folder, "bun.lockb"))) return "bun run test";
  if (existsSync(join(folder, "pnpm-lock.yaml"))) return "pnpm test";
  if (existsSync(join(folder, "yarn.lock"))) return "yarn test";
  return "npm test";
}

/** Every check the repo itself declares, by what its files say. */
export function candidates(folder: string): string[] {
  const out: string[] = [];
  const node = nodeCheck(folder);
  if (node) out.push(node);
  if (/^test\s*:/m.test(read(join(folder, "Makefile")) || read(join(folder, "makefile")))) out.push("make test");
  if (/^test\b[^\n]*:/m.test(read(join(folder, "justfile")))) out.push("just test");
  if (existsSync(join(folder, "Cargo.toml"))) out.push("cargo test");
  if (existsSync(join(folder, "go.mod"))) out.push("go test ./...");
  return out;
}

/** The check to use: the user's, or the one unambiguous runnable guess; else what to ask. */
export function chooseCheck(folder: string, given?: string): { check: string } | { ask: string } {
  if (given?.trim()) return { check: given.trim() };
  const found = candidates(folder);
  const runnable = found.filter((c) => Bun.which(c.split(" ")[0]));
  if (runnable.length === 1) return { check: runnable[0] };
  if (!found.length) return { ask: `cannot tell how to check work in ${folder}; name it: check "<command>"` };
  if (!runnable.length) return { ask: `the repo's check (${found.join(", ")}) needs a tool not on PATH here (maybe a devshell): name it: check "<command>"` };
  return { ask: `the repo has several checks (${runnable.join(", ")}); say which: check "<command>"` };
}

export type CheckResult = { passed: boolean; tail: string };

/** Run `check` in `cwd` through a login shell (the user's PATH), for at most `minutes`. */
export async function runCheck(check: string, cwd: string, minutes: number, x: Exec = exec): Promise<CheckResult> {
  const r = await x("zsh", ["-l", "-c", check], cwd, minutes * 60);
  const tail = `${r.out}\n${r.err}`.trim().split("\n").slice(-40).join("\n");
  return { passed: r.code === 0, tail: r.code === 124 ? `${tail}\n(timed out after ${minutes} min)` : tail };
}
