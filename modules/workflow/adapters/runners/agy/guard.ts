// What the wf-worker hook decides for one agy tool call. Pure: a deny reason, or null to stay
// neutral (agy's own permission rules then apply, with the run's commands allowed by --settings).
// Tool names are agy 1.4.12's, as the Luvus guard verified them.

export type Guard = { can: string[]; commands: string[] };

const CONTROL = /^(command_status|task_boundary|finish|notify_user|trajectory_search|wait\w*)$/;
const READ = /^(view_\w+|read_\w+|list_\w+|grep_search|find_by_name|search_in_file|codebase_search)$/;
const EDIT = /^write_\w+$|replace|edit$/;
const NETWORK = /url|web|browser/;
const COMMAND_KEYS = ["CommandLine", "commandLine", "command", "Command", "cmd"];

function args(call: Record<string, unknown>): Record<string, unknown> {
  const tc = (call.toolCall ?? {}) as Record<string, unknown>;
  const a = tc.args ?? tc.arguments ?? tc.input ?? {};
  if (typeof a === "string") {
    try {
      return JSON.parse(a);
    } catch {
      return {};
    }
  }
  return a as Record<string, unknown>;
}

/** Every `a && b ; c | d` part must start with an allowed prefix (or be a `cd`). */
export function allowedCommand(line: string, prefixes: string[]): boolean {
  const cmd = line.trim().replace(/^(cd\s+\S+\s*&&\s*)+/, "");
  if (cmd === "wf report" || cmd.startsWith("wf report ")) return prefixes.includes("wf report"); // the rest is the report's text
  if (/\$\(|`|>|<\(/.test(cmd)) return false; // substitution or redirect: never inferable as read-only
  return cmd.split(/\s*(?:&&|\|\||;|\|)\s*/).every((part) => {
    if (/^cd(\s|$)/.test(part)) return true;
    return prefixes.some((p) => part === p || part.startsWith(`${p} `));
  });
}

export function decide(call: Record<string, unknown>, g: Guard): string | null {
  const name = String((call.toolCall as Record<string, unknown> | undefined)?.name ?? "");
  if (CONTROL.test(name)) return null;
  // Network before read: `read_url_content` is a fetch, not a file read.
  if (NETWORK.test(name)) return g.can.includes("network") ? null : `${name}: this role has no network access`;
  if (READ.test(name)) return g.can.includes("read") ? null : `${name}: this role does not read files`;
  if (name === "run_command") {
    const a = args(call);
    const key = COMMAND_KEYS.find((k) => typeof a[k] === "string");
    if (!key) return `run_command: cannot read the command (args: ${Object.keys(a).join(", ") || "none"})`;
    const line = a[key] as string;
    if (allowedCommand(line, g.commands)) return null;
    return `this role may only run: ${g.commands.join(", ") || "nothing"} (got: ${line.slice(0, 120)})`;
  }
  if (EDIT.test(name)) return g.can.includes("edit") ? null : `${name}: this role does not edit files`;
  return `${name || "unknown tool"} is not allowed for wf workers`;
}
