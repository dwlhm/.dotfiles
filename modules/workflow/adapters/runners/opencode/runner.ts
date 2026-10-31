import type { Launch, LaunchInput } from "../../../engine/runners";

const GIT_READ = ["git status*", "git log*", "git diff*", "git show*", "git ls-files*", "git grep*", "git blame*", "git rev-parse*"];

/** OpenCode permission config for a role's capabilities and its check command. */
export function permissions(can: string[], check?: string): Record<string, unknown> {
  const bash: Record<string, string> = { "*": "deny" };
  const allow = (patterns: string[]) => patterns.forEach((p) => (bash[p] = "allow"));
  if (can.includes("shell-report")) allow(["wf report *"]);
  if (can.includes("shell-git-read")) allow(GIT_READ);
  if (can.includes("shell-qa")) allow(["qa *"]);
  if (can.includes("shell-check") && check) allow([check]);
  return {
    edit: can.includes("edit") ? "allow" : "deny",
    webfetch: can.includes("network") ? "allow" : "deny",
    bash,
  };
}

export function launch(i: LaunchInput): Launch {
  const config = JSON.stringify({ model: i.model, permission: permissions(i.can, i.check) });
  // --standalone: a private server per run. With the shared background service, parallel runs
  // got the config (model and permissions) of whichever run started it, and lost their prompts.
  return { argv: ["opencode", "--standalone", "--prompt", i.prompt], env: { OPENCODE_CONFIG_CONTENT: config } };
}
