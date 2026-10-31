import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Launch, LaunchInput } from "../../../engine/runners";

const GIT_READ = ["status", "log", "diff", "show", "ls-files", "grep", "blame", "rev-parse"].map((c) => `Bash(git ${c}:*)`);

/** The tools that exist for the run and the rules that allow them; everything else is denied. */
export function permissions(can: string[], check?: string): { tools: string[]; allow: string[] } {
  const tools = ["Read", "Grep", "Glob"];
  const allow = ["Read", "Grep", "Glob"];
  const shell: string[] = [];
  if (can.includes("shell-report")) shell.push("Bash(wf report:*)");
  if (can.includes("shell-git-read")) shell.push(...GIT_READ);
  if (can.includes("shell-qa")) shell.push("Bash(qa:*)");
  if (can.includes("shell-check") && check) shell.push(`Bash(${check})`);
  if (shell.length) tools.push("Bash"), allow.push(...shell);
  if (can.includes("edit")) tools.push("Edit", "Write"), allow.push("Edit", "Write");
  if (can.includes("network")) tools.push("WebFetch", "WebSearch"), allow.push("WebFetch", "WebSearch");
  return { tools, allow };
}

export function launch(i: LaunchInput): Launch {
  const p = permissions(i.can, i.check);
  const argv = ["claude", "--model", i.model, "--restricted", "--strict-mcp-config", "--permission-mode", "dontAsk"];
  return { argv: [...argv, "--tools", ...p.tools, "--allowedTools", ...p.allow, "--", i.prompt] };
}

/** Whether Claude Code already trusts `cwd` (or a folder above it). */
export function trusted(cwd: string, config = join(homedir(), ".claude.json")): boolean {
  if (!existsSync(config)) return false;
  const projects = (JSON.parse(readFileSync(config, "utf8")).projects ?? {}) as Record<string, { hasTrustDialogAccepted?: boolean }>;
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (projects[dir]?.hasTrustDialogAccepted) return true;
    if (dir === dirname(dir)) return false;
  }
}

export async function trust(cwd: string): Promise<void> {
  if (!trusted(cwd)) throw new Error(`Claude Code does not trust ${cwd} yet: open claude there once and accept the trust prompt`);
}
