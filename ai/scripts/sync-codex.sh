#!/usr/bin/env bash
# Install Codex pointers without changing other harnesses or config.toml.
set -euo pipefail

AI_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
SKILLS_DIR="$HOME/.agents/skills"
ADAPTER="$AI_ROOT/adapters/codex/AGENTS.md"

# Validate all sources and the overriding instruction file before any mutation.
if [ ! -f "$ADAPTER" ]; then
  echo "Missing Codex adapter: $ADAPTER" >&2
  exit 1
fi
if [ -s "$CODEX_DIR/AGENTS.override.md" ]; then
  echo "Refusing installation: $CODEX_DIR/AGENTS.override.md shadows AGENTS.md" >&2
  exit 1
fi
for source in "$AI_ROOT/skills"/*; do
  [ -e "$source" ] || [ -L "$source" ] || continue
  if [ ! -d "$source" ] || [ ! -f "$source/SKILL.md" ]; then
    echo "Invalid canonical skill: $source" >&2
    exit 1
  fi
done

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
    echo "Backed up $destination to $backup/original"
  fi
  ln -s "$source" "$destination"
  echo "Linked $destination -> $source"
}

install_link "$ADAPTER" "$CODEX_DIR/AGENTS.md"
for source in "$AI_ROOT/skills"/*; do
  [ -d "$source" ] || continue
  install_link "$source" "$SKILLS_DIR/$(basename "$source")"
done
