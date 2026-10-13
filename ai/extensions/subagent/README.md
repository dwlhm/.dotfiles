# Subagent Extension

Copied from the official pi example `examples/extensions/subagent/` (pi 0.84.2).
Provides the `subagent` tool: single / parallel / chain delegation to agents
defined as markdown files in `~/.pi/agent/agents/` (symlinked to `ai/agents/`).

Adaptation: canonical agent bodies carry no frontmatter; `ai/scripts/sync.sh`
generates pi stubs that pin `model:` from `PI_SUBAGENT_MODEL`
(default `antigravity/gemini-3.8-flash`). The extension passes it as `--model`.

Workflow prompts live in `ai/prompts/` -> `~/.pi/agent/prompts/`:
`/implement`, `/scout-and-review`, `/implement-and-review`.

Re-sync on pi upgrade: re-copy index.ts + agents.ts from the new version's
examples/extensions/subagent/, then update this README's version note.
