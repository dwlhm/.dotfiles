#!/usr/bin/env bash
# sync.sh — Generate pointer-style agent stubs into machine config.
#
# Canonical sources (pure prompt content, harness-agnostic):
#   ai/agents/<name>.md  — agent bodies (NO frontmatter)
#   ai/core/*.md         — routing policy / rules
#
# Generates POINTER stubs (never inline canonical content):
#   ~/.config/opencode/agent/<name>.md   — opencode frontmatter + pointer body
#   ~/.gemini/config/agents/<name>.md    — antigravity frontmatter + pointer body
#
# antigravity rules are wired via @ mentions in
# ai/adapters/antigravity/GEMINI.md — no stubs needed.
#
# Per-harness frontmatter (description, mode, permissions, tools, model)
# lives HERE, not in the canonical bodies.
#
# Run this only when adding, removing, or renaming an agent.
# Editing a canonical body needs no re-sync. The script is idempotent and
# removes stale stubs whose canonical file no longer exists.

set -euo pipefail

AI_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS_SRC="$AI_ROOT/agents"
CORE_SRC="$AI_ROOT/core"
DOTFILES="/Users/dwlhm/.dotfiles"

OPENCODE_AGENT_DIR="$HOME/.config/opencode/agent"
GEMINI_AGENTS_DIR="$HOME/.gemini/config/agents"

CREATED=0
REMOVED=0

# ─── Per-agent descriptions (injected into every harness's frontmatter) ──────

agent_description() {
  case "$1" in
    implementer)
      echo "Executes approved implementation plans by writing, editing, and running code. Default delegation target for ALL implementation work — Tier 1 and Tier 2. Do NOT invoke for analysis, planning, or architectural decisions."
      ;;
    git-manager)
      echo "Dedicated subagent for local Git repository operations — status, diff, log, staging, committing, branching — executed cleanly without unnecessary permission prompts while keeping the repository and remote safe."
      ;;
    *)
      echo "Persistent subagent: $1."
      ;;
  esac
}

pointer_body() {
  echo "Your complete instructions are in $DOTFILES/ai/agents/$1.md. Read that file now and follow it exactly. Do not act before reading it."
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

mkdir -p "$OPENCODE_AGENT_DIR" "$GEMINI_AGENTS_DIR"

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

$(pointer_body "$name")
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
  - multi_replace_file_content
  - grep_search
  - list_dir
  - run_command
---

$(pointer_body "$name")
EOF

done

# ─── Stale-stub cleanup ───────────────────────────────────────────────────────

echo "→ Removing stale stubs..."

cleanup_stale "$OPENCODE_AGENT_DIR" "$AGENTS_SRC"
cleanup_stale "$GEMINI_AGENTS_DIR" "$AGENTS_SRC"

echo "→ Sync complete: $CREATED stub(s) written, $REMOVED stale stub(s) removed."
