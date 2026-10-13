# Architectural Decision Records (ADR) — Dotfiles

## ADR-005: Inlined Agent Stubs and Batch Verification in Implementer (2026-09-15)

### Context
Subagent pointer stubs ("Your complete instructions are in...") required every subagent invocation to make an initial `view_file` tool call to load its instructions, introducing startup latency and consuming context. Additionally, when implementing multi-file changes, implementers frequently performed piecemeal single-line edits with intermediate compiler checks (e.g. `odin check`) between edits. This caused false compiler failures on interdependent files, prompting agents to enter circular exploratory loops and read core AI configuration files instead of focusing on project code.

### Decision
1. Update `ai/scripts/sync.sh` to inline canonical agent bodies (`ai/agents/<name>.md`) directly beneath harness frontmatter into machine config stubs (`~/.gemini/config/agents/`, `~/.config/opencode/agent/`, `~/.pi/agent/agents/`), removing `pointer_body`.
2. Update `ai/agents/implementer.md` to:
   - Mandate **Batch Execution**: apply changes directly and decisively to target files per the plan without piecemeal interruptions.
   - Enforce **Single End-of-Task Verification**: verification commands (builds, compiler checks, linters, tests) must run only once after all planned files are modified, never in the middle of editing coupled files.
   - Prohibit **AI Config Reading**: forbid reading `ai/core/` rules, agent files, or AI configs during project code implementation unless explicitly tasked with doing so.
3. Update dotfiles documentation (`ai/README.md`, `gotchas.md`, `wip.md`) to reflect the inlining workflow and verification constraints.

### Rationale
Inlining canonical bodies gives subagents immediate full instructions in their initial prompt without an initial `view_file` round-trip. Mandating batch edits and single end-of-task verification eliminates circular diagnostic traps caused by premature compiler checks on incomplete multi-file diffs.

### Consequences
- **Positive**: Zero-latency startup for subagents; no wasted tool round-trip reading instruction files; faster and cleaner multi-file refactoring without false compiler feedback loops.
- **Negative**: Editing canonical agent bodies in `ai/agents/<name>.md` now requires running `bash ai/scripts/sync.sh` to propagate updates into machine configuration stubs.

## ADR-003: paus Removed from pi Entirely — No Feature Migration (2026-09-08)

### Context
pi's cross-agent messaging depended on the external paus MCP server (~/project/paus). The user decided to stop using paus with pi altogether. An initial attempt ported all paus abilities (4 tools + dashboard) into a native orchestrator extension; the user corrected the intent: remove paus, do NOT migrate its features. What the user actually wants is pi complying with the mechanisms/strategies/workflows already defined in ~/.dotfiles/ai adapters and core rules.

### Decision
Remove the paus entry from ~/.pi/agent/mcp.json (mcpServers now empty). Delete the ported orchestrator extension (ai/extensions/orchestrator/) and the paus-orchestrator skill. Do not register any cross-host messaging tool in pi. The paus project itself and its shared NDJSON store remain untouched for other hosts if the user still uses them elsewhere — but pi no longer participates.

### Rationale
pi's configured workflow (Lead Orchestrator Protocol, core rules, dotfiles-defined agents) is self-contained: internal delegation via the subagent extension, no external message bus required. Migrating paus features would add maintenance surface (forked core logic, dashboard process) the user never asked for.

### Consequences
- **Positive**: pi configuration is minimal and fully aligned with ~/.dotfiles/ai; no forked paus code to maintain; no background dashboard process.
- **Negative**: pi sessions can no longer exchange messages with antigravity/opencode hosts via the paus bus (acceptable per user decision).

## ADR-004: pi Compliance with the Canonical ai/ Architecture (2026-09-08)

### Context
The pi harness had drifted from the canonical ~/.dotfiles/ai design: example agents (scout/planner/reviewer/worker with frontmatter and inline bodies) polluted the pure-body `ai/agents/` dir, an example `ai/prompts/` dir existed outside the canonical structure, sync.sh did not generate pi stubs, and the pi adapter's Tool Policy let the lead mutate files directly after the Step 5 gate — contradicting orchestration.md §1 Zero Direct Mutation.

### Decision
Extend `ai/scripts/sync.sh` to generate pi pointer stubs into `~/.pi/agent/agents/<name>.md` (pi subagent frontmatter: name/description/tools per agent; implementer full tools, architect and git-manager scoped) with cleanup_stale parity. Delete the four example agent copies and `ai/prompts/`. Rewrite the pi adapter Execution Mechanics to comply: Zero Direct Mutation (all mutations via `implementer` subagent), `architect` per Task Group in Step 4, separate `implementer` per Task Group in Step 6, `git-manager` for git ops, subagent invocation syntax (single/parallel/chain), load/reload semantics, and the agent-file editing policy. Update `ai/README.md` structure + adapters table.

### Rationale
The canonical architecture (README "Canonical vs Generated") centralizes agent bodies as pure prompts with per-harness frontmatter in sync.sh; pi is simply a third harness. Pointer stubs keep one source of truth — the child subagent reads its canonical body at dispatch (verified: the architect child enforced its canonical four-section blueprint format). Zero Direct Mutation in the adapter mirrors the opencode adapter and orchestration.md §1, making behavior identical across harnesses.

### Consequences
- **Positive**: pi now behaves per the configured workflow on every axis — tiers, gates, delegation, briefing template, agent set (implementer/architect/git-manager), model inheritance; agent edits take effect immediately (discovery is per-invocation); sync.sh also backfilled the missing architect stub for opencode and antigravity.
- **Negative**: orchestrator can no longer mutate project files directly even for small follow-ups (by design — Tier 0 goes straight to implementer); the subagent extension (ai/extensions/subagent/) is copied from the pi 0.84.2 example and needs re-syncing on pi upgrades.

## ADR-002: pi Subagent Extension — Official Example, Model Inheritance (2026-09-08)

### Context
Lead Orchestrator Protocol previously stated "pi has no subagent mechanism", making the `subagent-management` skill dead weight in the pi adapter and forcing the lead to do all execution itself. pi 0.84.2 ships an official subagent example extension (`examples/extensions/subagent/`) that spawns child `pi` processes with isolated context.

### Decision
Install the official example following the dotfiles pattern: copy `index.ts` + `agents.ts` to `ai/extensions/subagent/`, agent definitions to `ai/agents/`, workflow prompts to `ai/prompts/`, then symlink into `~/.pi/agent/{extensions/subagent,agents,prompts}`. Strip the `model:` frontmatter from all agent definitions so subagents inherit the dispatching session's active model and thinking level. Update `ai/adapters/pi/AGENTS.md` to a Lead-Orchestrated pipeline: read-only delegation (scout) allowed in Phase 1; mutating delegation (worker) and review (reviewer) only after the Step 5 confirmation gate.

### Rationale
The pnpm global store path embeds the pi version and breaks on upgrade, so symlinking directly into the store is fragile — dotfiles copies are version-controlled and stable. Hardcoded example models (`claude-haiku-4-5`, `claude-sonnet-4-5`) are absent from the available auth (opencode-go / agentrouter), so model pinning would fail at dispatch; inheritance keeps agents provider-agnostic. Keeping the confirmation gate over subagent mutations preserves the orchestration protocol's safety semantics now that an agent with full tools (worker) exists.

### Consequences
- **Positive**: `subagent` tool available in every pi session (single/parallel/chain modes); `/implement`, `/scout-and-plan`, `/implement-and-review` workflow prompts; skill `subagent-management` now functional in the pi adapter; verified end-to-end (scout listed directory contents, inherited glm-5.3).
- **Negative**: Extension code must be re-synced manually on pi upgrades (noted in `ai/extensions/subagent/README.md`); subagent cost is per-child-process model usage (parallel capped at 8 tasks / 4 concurrent, 50KB per-task output cap).

## ADR-001: Code Grounding Citation Standard (`symbol(shape) @ file:line`)

### Context
Agent diagnoses and plans were frequently unfalsifiable — generic verdicts ("state management isn't robust") referencing no real code, and rewrite proposals whose root causes cited nothing. Reviewers could not distinguish a diagnosis from rewrite optimism. Additional constraint: the standard must survive low-reasoning models (flash-tier implementers) that skip judgment-based prose instructions.

### Decision
Every claim about existing code cites `symbol(shape) @ file:line` (e.g., `calc(a, b) @ Math.swift:42`) — real symbol name, real parameters, real location. Every symbol a plan intends to create is declared with signature and destination from the start (`calc(a, b) @ src/math.ts`). Generic verdicts are rejected; a cause that cannot fill the format is a hypothesis, not a diagnosis. Encoded across three protocol files:

- `ai/core/design-thinking.md` — Hard Rule `NO Unnamed Symbols`
- `ai/core/gates.md` — `Citation` section (format + mandatory/optional scope)
- `ai/core/orchestration.md` — Boundary Constraint `Zero hallucination`

### Consequences
- **Positive**: Diagnoses are checkable in place (name + location together); plans are reviewable before implementation; weak models comply by pattern-matching a literal format; layered gates (generation format + review checklist + approval rejection) catch skips and force regeneration.
- **Negative**: Higher output verbosity per claim; takes effect only in sessions started after the edit (instructions load at startup).
