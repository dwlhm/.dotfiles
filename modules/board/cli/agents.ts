// How each agent CLI starts a session with a first prompt and resumes it later with its context.
// Verified flags (2026-11-01): claude `--session-id`/`--resume`, opencode `--session` (creates
// when unknown) + `--prompt`, agy `-i` + `--continue` (agy cannot be given a session id).
// Fork: claude `--resume <old> --fork-session --session-id <new>`, codex `fork --last`; opencode's
// `--fork` picks an id we cannot learn and agy has none, so their follow-ups start fresh.
export interface AgentSpec {
  /** A fresh session id to pass on start, or null when the CLI picks its own. */
  newSession(uuid: string): string | null;
  start(session: string | null, prompt: string): string[];
  /** `prompt` carries hand-backs that arrived while the agent was not running. */
  resume(session: string | null, prompt?: string): string[];
  /** A new session that starts from a copy of `from`'s context, when the CLI can fork one we can
   *  resume later. */
  fork?(from: string | null, session: string | null, prompt: string): string[];
}

export const AGENTS: Record<string, AgentSpec> = {
  claude: {
    newSession: (uuid) => uuid,
    start: (s, p) => ["claude", "--session-id", s!, p],
    resume: (s, p) => ["claude", "--resume", s!, ...(p ? [p] : [])],
    fork: (f, s, p) => ["claude", "--resume", f!, "--fork-session", "--session-id", s!, p],
  },
  opencode: {
    newSession: (uuid) => `ses_board${uuid.replaceAll("-", "").slice(0, 21)}`,
    start: (s, p) => ["opencode", "--session", s!, "--prompt", p],
    resume: (s, p) => ["opencode", "--session", s!, ...(p ? ["--prompt", p] : [])],
  },
  agy: {
    newSession: () => null,
    start: (_s, p) => ["agy", "-i", p],
    // agy keeps no id we can pass: its latest conversation in the task's folder.
    resume: (_s, p) => ["agy", "--continue", ...(p ? ["-i", p] : [])],
  },
  codex: {
    newSession: () => null,
    start: (_s, p) => ["codex", p],
    resume: (_s, p) => ["codex", "resume", "--last", ...(p ? [p] : [])],
    fork: (_f, _s, p) => ["codex", "fork", "--last", p],
  },
};

export function agentSpec(name: string): AgentSpec {
  const spec = AGENTS[name];
  if (!spec) throw new Error(`unknown agent "${name}" (known: ${Object.keys(AGENTS).join(", ")})`);
  return spec;
}
