// How each agent CLI starts a session with a first prompt and resumes it later with its context.
// Verified flags (2026-11-01): claude `--session-id`/`--resume`, opencode `--session` (creates
// when unknown) + `--prompt`, agy `-i` + `--continue` (agy cannot be given a session id).
export interface AgentSpec {
  /** A fresh session id to pass on start, or null when the CLI picks its own. */
  newSession(uuid: string): string | null;
  start(session: string | null, prompt: string): string[];
  /** `prompt` carries hand-backs that arrived while the agent was not running. */
  resume(session: string | null, prompt?: string): string[];
}

export const AGENTS: Record<string, AgentSpec> = {
  claude: {
    newSession: (uuid) => uuid,
    start: (s, p) => ["claude", "--session-id", s!, p],
    resume: (s, p) => ["claude", "--resume", s!, ...(p ? [p] : [])],
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
  },
};

export function agentSpec(name: string): AgentSpec {
  const spec = AGENTS[name];
  if (!spec) throw new Error(`unknown agent "${name}" (known: ${Object.keys(AGENTS).join(", ")})`);
  return spec;
}
