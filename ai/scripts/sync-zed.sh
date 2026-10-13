#!/usr/bin/env bash
# sync-zed.sh — Install the Zed adapter and skill links without changing other harnesses.
#
# Installs:
#   ~/.config/zed/AGENTS.md  → symlink to ai/adapters/zed/AGENTS.md
#   ~/.agents/skills/<name>  → symlink to ai/skills/<name>  (shared with Codex)
#
# Existing conflicts are backed up before linking.
# Run after editing adapters/zed/AGENTS.md or adding/removing skills.
# Start a new Zed thread after running so the updated file is loaded.

set -euo pipefail

AI_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZED_CONFIG_DIR="${ZED_CONFIG_DIR:-$HOME/.config/zed}"
SKILLS_DIR="$HOME/.agents/skills"
ADAPTER="$AI_ROOT/adapters/zed/AGENTS.md"

# ─── Validate sources ─────────────────────────────────────────────────────────

if [ ! -f "$ADAPTER" ]; then
  echo "Missing Zed adapter: $ADAPTER" >&2
  exit 1
fi

for source in "$AI_ROOT/skills"/*; do
  [ -e "$source" ] || [ -L "$source" ] || continue
  if [ ! -d "$source" ] || [ ! -f "$source/SKILL.md" ]; then
    echo "Invalid canonical skill: $source" >&2
    exit 1
  fi
done

# ─── Helpers ──────────────────────────────────────────────────────────────────

# install_link <absolute-source> <destination>
install_link() {
  local source="$1" destination="$2"
  local backup
  if [ ! -e "$source" ]; then
    echo "Missing source: $source" >&2
    return 1
  fi
  if [ -L "$destination" ] && [ "$(readlink "$destination")" = "$source" ]; then
    return 0
  fi
  mkdir -p "$(dirname "$destination")"
  if [ -e "$destination" ] || [ -L "$destination" ]; then
    backup="$(mktemp -d "${destination}.backup.$(date +%Y%m%d-%H%M%S).XXXXXX")"
    mv "$destination" "$backup/original"
    echo "  Backed up $destination → $backup/original"
  fi
  ln -s "$source" "$destination"
  echo "  Linked $destination → $source"
}

# ─── Install ──────────────────────────────────────────────────────────────────

echo "→ Installing Zed adapter..."
install_link "$ADAPTER" "$ZED_CONFIG_DIR/AGENTS.md"

echo "→ Linking skills..."
mkdir -p "$SKILLS_DIR"
for source in "$AI_ROOT/skills"/*; do
  [ -d "$source" ] || continue
  install_link "$source" "$SKILLS_DIR/$(basename "$source")"
done

echo "→ Done. Start a new Zed thread to pick up the updated AGENTS.md."
