import type { Launch, LaunchInput } from "../../../engine/runners";
import { decide } from "./guard";

const GIT_READ = ["status", "log", "diff", "show", "ls-files", "grep", "blame", "rev-parse"].map((c) => `git ${c}`);

/** The command prefixes a role may run (`check` is matched exactly). */
export function commands(can: string[], check?: string): string[] {
  const out: string[] = [];
  if (can.includes("shell-report")) out.push("wf report");
  if (can.includes("shell-git-read")) out.push(...GIT_READ);
  if (can.includes("shell-qa")) out.push("qa");
  if (can.includes("shell-check") && check) out.push(check);
  return out;
}

export function launch(i: LaunchInput): Launch {
  const allow = commands(i.can, i.check);
  // Session-only: trust this run's folder and allow its commands without a prompt.
  const settings = { trustedWorkspaces: [i.cwd], permissions: { allow: allow.map((c) => `command(${c})`) } };
  return {
    argv: ["agy", "--model", i.model, "--settings", JSON.stringify(settings), "-i", i.prompt],
    // Read by the wf-worker hook (hook processes inherit agy's env).
    env: { WF_GUARD: JSON.stringify({ can: i.can, commands: allow }) },
  };
}

/** The PreToolUse hook: `wf hook agy` passes the tool call (stdin JSON) and its env. */
export function hook(input: string, env: Record<string, string | undefined>): string {
  if (!env.WF_GUARD) return ""; // not a wf run: stay neutral
  const guard = JSON.parse(env.WF_GUARD) as { can: string[]; commands: string[] };
  const reason = decide(JSON.parse(input), guard);
  return reason ? JSON.stringify({ decision: "deny", reason: `wf policy: ${reason}` }) : "";
}

