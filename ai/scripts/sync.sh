#!/usr/bin/env bash
# sync.sh — Generate inlined agent stubs into machine config.
#
# Canonical sources (pure prompt content, harness-agnostic):
#   ai/agents/<name>.md  — agent bodies (NO frontmatter)
#   ai/core/*.md         — routing policy / rules
#
# Generates INLINED stubs into machine config (eliminates initial view_file tool calls):
#   ~/.config/opencode/agent/<name>.md   — opencode frontmatter + canonical body
#   ~/.gemini/config/agents/<name>.md    — antigravity frontmatter + canonical body
#   ~/.pi/agent/agents/<name>.md         — pi subagent frontmatter + canonical body
#   (pi stubs are discovered by the subagent extension in
#    ~/.pi/agent/extensions/subagent/ — fresh on every tool invocation)
#
# antigravity rules are wired via inlined core rules in
# ai/adapters/antigravity/GEMINI.md — no stubs needed.
#
# Zed personal instructions are a symlink managed by sync-zed.sh:
#   ~/.config/zed/AGENTS.md → ai/adapters/zed/AGENTS.md
# Run sync-zed.sh separately (or it is called by this script at the end).
#
# Per-harness frontmatter (description, mode, permissions, tools, model)
# lives HERE, not in the canonical bodies.
#
# Run this when adding, removing, renaming, or updating an agent.
# The script is idempotent and removes stale stubs whose canonical file no longer exists.

set -euo pipefail

AI_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS_SRC="$AI_ROOT/agents"
CORE_SRC="$AI_ROOT/core"
EXTENSIONS_SRC="$AI_ROOT/extensions"
DOTFILES="/Users/dwlhm/.dotfiles"

OPENCODE_AGENT_DIR="$HOME/.config/opencode/agent"
GEMINI_AGENTS_DIR="$HOME/.gemini/config/agents"
PI_AGENTS_DIR="$HOME/.pi/agent/agents"
PI_EXTENSIONS_DIR="$HOME/.pi/agent/extensions"
# pi: model pinned for every subagent stub. Override per run: PI_SUBAGENT_MODEL=<provider/id> sync.sh
PI_SUBAGENT_MODEL="${PI_SUBAGENT_MODEL:-antigravity/gemini-3.8-flash}"
GEMINI_ADAPTER="$AI_ROOT/adapters/antigravity/GEMINI.md"

CREATED=0
REMOVED=0
EXT_LINKED=0
EXT_REMOVED=0

# ─── Per-agent descriptions (injected into every harness's frontmatter) ──────

agent_description() {
  case "$1" in
    implementer)
      echo "Executes approved implementation plans by writing, editing, and running code. Default delegation target for ALL implementation work — Tier 1 and Tier 2. Do NOT invoke for analysis, planning, or architectural decisions."
      ;;
    git-manager)
      echo "Dedicated subagent for local Git repository operations — status, diff, log, staging, committing, branching — executed cleanly without unnecessary permission prompts while keeping the repository and remote safe."
      ;;
    architect)
      echo "Produces a localized technical blueprint (Result, Crack, Need analysis, exact symbol signatures, side-effect isolation) for one Task Group. Read-only analysis — never writes implementation code. Invoke one architect per decomposed Task Group during Step 4 planning."
      ;;
    *)
      echo "Persistent subagent: $1."
      ;;
  esac
}

# pi: tool allowlist per agent (omit the line to inherit all default tools).
pi_agent_tools() {
  case "$1" in
    implementer) echo "read, bash, edit, write, grep, find, ls" ;;
    architect)   echo "read, grep, find, ls" ;;
    git-manager) echo "bash, read, grep, find, ls" ;;
    *)           echo "" ;;
  esac
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

# write_stub <destination-path>  (content on stdin; only writes when changed)
write_stub() {
  local dst="$1"
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  if [ -f "$dst" ] && cmp -s "$tmp" "$dst"; then
    rm -f "$tmp"
  else
    chmod 644 "$tmp"
    mv "$tmp" "$dst"
    CREATED=$((CREATED + 1))
    echo "  + $dst"
  fi
}

# cleanup_stale <stub-dir> <canonical-dir>
cleanup_stale() {
  local dir="$1" canonical_dir="$2"
  [ -d "$dir" ] || return 0
  local stub base
  for stub in "$dir"/*.md; do
    [ -e "$stub" ] || continue
    base="$(basename "$stub")"
    if [ ! -f "$canonical_dir/$base" ]; then
      rm -f "$stub"
      REMOVED=$((REMOVED + 1))
      echo "  - $stub"
    fi
  done
}

indent2() {
  sed 's/^/  /'
}

# ─── Generate ─────────────────────────────────────────────────────────────────

mkdir -p "$OPENCODE_AGENT_DIR" "$GEMINI_AGENTS_DIR" "$PI_AGENTS_DIR"

echo "→ Generating agent stubs..."

agent_file=""
for agent_file in "$AGENTS_SRC"/*.md; do
  [ -e "$agent_file" ] || continue
  name="$(basename "$agent_file" .md)"
  desc="$(agent_description "$name")"

  write_stub "$OPENCODE_AGENT_DIR/$name.md" <<EOF
---
description: >-
$(printf '%s' "$desc" | indent2)
mode: subagent
permission:
  edit: allow
  bash: ask
---

$(cat "$AGENTS_SRC/$name.md")
EOF

  write_stub "$GEMINI_AGENTS_DIR/$name.md" <<EOF
---
name: $name
description: >-
$(printf '%s' "$desc" | indent2)
subagent: true
model: flash
commandExecutionPolicy: sandbox
tools:
  - view_file
  - write_to_file
  - replace_file_content
  - run_command
---

$(cat "$AGENTS_SRC/$name.md")
EOF

  pi_tools="$(pi_agent_tools "$name")"
  if [ -n "$pi_tools" ]; then
    write_stub "$PI_AGENTS_DIR/$name.md" <<EOF
---
name: $name
description: >-
$(printf '%s' "$desc" | indent2)
tools: $pi_tools
model: $PI_SUBAGENT_MODEL
---

$(cat "$AGENTS_SRC/$name.md")
EOF
  else
    write_stub "$PI_AGENTS_DIR/$name.md" <<EOF
---
name: $name
description: >-
$(printf '%s' "$desc" | indent2)
model: $PI_SUBAGENT_MODEL
---

$(cat "$AGENTS_SRC/$name.md")
EOF
  fi

done

# ─── Stale-stub cleanup ───────────────────────────────────────────────────────

echo "→ Removing stale stubs..."

cleanup_stale "$OPENCODE_AGENT_DIR" "$AGENTS_SRC"
cleanup_stale "$GEMINI_AGENTS_DIR" "$AGENTS_SRC"
cleanup_stale "$PI_AGENTS_DIR" "$AGENTS_SRC"

# ─── Extensions ───────────────────────────────────────────────────────────────

mkdir -p "$PI_EXTENSIONS_DIR"

echo "→ Syncing pi extension symlinks..."

ext_dir=""
for ext_dir in "$EXTENSIONS_SRC"/*; do
  [ -d "$ext_dir" ] || continue
  ext_name="$(basename "$ext_dir")"
  target="$PI_EXTENSIONS_DIR/$ext_name"

  if [ ! -L "$target" ] || [ "$(readlink "$target")" != "$ext_dir" ]; then
    rm -rf "$target"
    ln -s "$ext_dir" "$target"
    EXT_LINKED=$((EXT_LINKED + 1))
    echo "  + symlink: $ext_name"
  fi
done

# Cleanup stale extension symlinks
target=""
for target in "$PI_EXTENSIONS_DIR"/*; do
  [ -L "$target" ] || continue
  ext_name="$(basename "$target")"
  if [ ! -d "$EXTENSIONS_SRC/$ext_name" ]; then
    rm -f "$target"
    EXT_REMOVED=$((EXT_REMOVED + 1))
    echo "  - symlink: $ext_name"
  fi
done

# ─── Antigravity GEMINI.md (Inlined Core Rules) ──────────────────────────────

echo "→ Generating inlined Antigravity GEMINI.md..."

write_stub "$GEMINI_ADAPTER" <<EOF
# Lead Orchestrator Protocol (Antigravity)

You act as the **Lead Technical Orchestrator**: system design, dependency analysis, task triage, and quality gatekeeping. Execution mechanics for Antigravity are defined below, followed by inlined core rules.

---

## Execution Directives

1. **Language Policy**:
   - User communication: Indonesian by default (or matching user language) for plans, explanations, and questions.
   - Code & artifacts: 100% English for code, comments, variables, types, and git commit messages.
   - Prompts & rules: 100% English.

2. **Plan Before Execute**:
   - **Simple Mode (Tier 0/1)**: Concise 2–4 line summary of changes and verification. Proceed directly to execution without a gate.
   - **Deep Mode (Tier 2)**: Full Result / Crack / Need breakdown + Change Impact Check. Present plan and ask: "Apakah plan ini sudah sesuai dengan yang kamu maksud? (ya / tidak)". End turn immediately. Hard stop until user confirms with ya (unless user provided explicit upfront approval like 'langsung ke perbaikan saja').

3. **Zero Direct Mutation**:
   - Orchestrator MUST NEVER invoke mutation tools (\`write_to_file\`, \`replace_file_content\`, mutating shell commands) on workspace source files.
   - ALL code authoring and file mutations MUST be delegated to the \`implementer\` subagent via \`invoke_subagent\`.
   - Artifact files (\`implementation_plan.md\`, \`walkthrough.md\`) in the brain directory may be authored directly by the orchestrator.
   - If the harness lacks subagent delegation tools, execute directly and record the fallback in the Delta Report.

4. **Structured Thinking: Result / Crack / Need**:
   - Substance over ceremony: strictly NO decorative ASCII art trees (\`──→\`), fences, or graphs as a formality.
   - Structure analysis around the Three Lenses: Result (functional dataflow & terminal sink), Crack (failure modes & fallback paths), Need (dependencies & preconditions).

5. **Systemic Drift Correction**:
   - If a rule violation occurs, never use apologies as an escape hatch.
   - Treat drift as a defect in instructions. Propose concrete edits to configuration files or core rules to patch the root cause, obtain approval, and apply.

---

## Tool Glossary

| Tool | Purpose |
|---|---|
| \`view_file\` | Read file contents (read-only) |
| \`write_to_file\` | Write files (orchestrator: brain artifacts only; implementer: workspace files) |
| \`replace_file_content\` | Targeted file modifications (delegated to implementer) |
| \`run_command\` | Execute commands (orchestrator: read-only; implementer: build/test/mutations) |
| \`call_mcp_tool\` | Invoke MCP server tools (e.g. \`pencil\`) |
| \`invoke_subagent\` | Delegate execution to specialized subagents |

---

## Tool Selection Hierarchy

For all data inspection and transformation tasks, use the most minimal tool that can accomplish the task. Priority order is mandatory:

1. **Shell native** — \`grep\`, \`cat\`, \`head\`, \`tail\`, \`wc\`, \`sort\`, \`awk\`, \`sed\`
2. **Purpose-built CLI** — \`jq\` for JSON/JSONL, \`yq\` for YAML
3. **Python script** via \`run_command\` — only when steps 1–2 cannot accomplish the task. Usage requires explicit justification stating why steps 1–2 are insufficient.

Defaulting to Python without exhausting steps 1–2 is a violation.

---

## Terminal Execution Protocol (Native Terminal)

Use the host agent's built-in terminal tool (Antigravity: \`run_command\`) for all shell execution. term-mcp is disabled.

1. Run sandboxed first (\`BypassSandbox: false\`).
2. If the command fails with a sandbox block (e.g. exit code 71, \`sandbox-exec: execvp() ... Operation not permitted\`), retry the same single command with \`BypassSandbox: true\`; keep chains split so only the blocked step runs unsandboxed.
3. Long-running processes: use the tool's own backgrounding (\`WaitMsBeforeAsync\` / \`IsDaemon\`), not shell \`&\`.

---

## Security Guardrails (Destructive Removal & Credential Protection)

1. **Destructive Deletion Block**: NEVER execute recursive, bulk, or unconfirmed deletion commands (\`rm -rf\`, \`rm -r\`, drop/wipe) via \`run_command\` or any terminal tool. Deletion/removal operations must never be bypassed or automated silently.
2. **Credential Protection**: NEVER inspect, output, or expose credential stores, tokens, \`.env\` secret values, SSH keys (\`id_ed25519\`, \`id_rsa\`), AWS credentials, or keychain secrets.

---

## Subagent Invocation (Antigravity Schema)

Invoke subagents via \`invoke_subagent\`:
\`\`\`json
{
  "Subagents": [
    {
      "TypeName": "implementer",
      "Role": "<2-5 word role description>",
      "Prompt": "<verbatim approved plan and instructions>",
      "Model": "inherit",
      "Workspace": "inherit"
    }
  ]
}
\`\`\`
\`<TypeName>\` must match a registered agent (\`implementer\`, \`architect\`, \`git-manager\`).

---

## Models

- Default: \`inherit\` / \`flash\`.
- Use \`pro\` only when \`flash\` fails and the task requires deep reasoning.

---

## Orchestrator Boundary & Post-Delegation Review Gate

1. **Workspace Boundary**: Orchestrator performs read-only inspection (\`view_file\` and read-only terminal commands). All code authoring and file mutations in the workspace MUST be delegated to \`implementer\` via \`invoke_subagent\`.
2. **Terminal Boundary**: Orchestrator uses the native terminal tool (\`run_command\`) strictly for read-only inspection (\`git status\`, \`git log\`, \`cat\`, \`head\`, \`tail\`, \`ls\`, read-only \`grep\`). All mutating commands (build, test runs, code modifications) must be delegated to \`implementer\`.
3. **Artifact Management**: Orchestrator has full authority to create and update artifacts in the brain directory (\`implementation_plan.md\` and \`walkthrough.md\`).
4. **Post-Delegation Quality Gate**: After a subagent completes its task, the orchestrator MUST inspect the diff (\`git diff\` or \`view_file\`) and verify the Hard Rules (\`design-thinking.md\`), the gates (\`gates.md\`), and Closed-Loop Dataflow (\`code-quality.md\`) BEFORE declaring the task complete or presenting a walkthrough to the user.

---

# Inlined Core Rules

## 1. Orchestration Protocol
$(cat "$CORE_SRC/orchestration.md")

---

## 2. Design Thinking
$(cat "$CORE_SRC/design-thinking.md")

---

## 3. Gates
$(cat "$CORE_SRC/gates.md")

---

## 4. Code Quality
$(cat "$CORE_SRC/code-quality.md")

---

## 5. Language
$(cat "$CORE_SRC/language.md")

---

## 6. Second Brain
$(cat "$CORE_SRC/second-brain.md")
EOF

echo "→ Sync complete: $CREATED stub(s) written, $REMOVED stale stub(s) removed, $EXT_LINKED extension symlink(s) created, $EXT_REMOVED stale extension symlink(s) removed."

# ─── Zed ──────────────────────────────────────────────────────────────────────

echo "→ Running sync-zed.sh..."
bash "$AI_ROOT/scripts/sync-zed.sh"
