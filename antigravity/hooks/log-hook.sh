#!/bin/sh
# log-hook.sh
# Does one thing: append a JSONL telemetry entry for the current lifecycle event.
#
# Called by hooks.json on: PreInvocation, PostInvocation, Stop, PostToolUse
# Environment variables are injected by the Antigravity runtime.

set -e

# --- Resolve project name from current working directory ---
PROJECT="${AGY_PROJECT_NAME:-$(basename "$PWD")}"

# --- Resolve log path ---
LOG_DIR="$HOME/logs/antigravity/$PROJECT"
LOG_FILE="$LOG_DIR/session-$(date +%Y-%m-%d).jsonl"

# --- Create log directory if needed ---
mkdir -p "$LOG_DIR"

# --- Collect fields ---
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EVENT="${AGY_EVENT:-unknown}"
MODEL="${AGY_MODEL:-null}"
PHASE="${AGY_PHASE:-unknown}"
TOOL="${AGY_TOOL_NAME:-null}"
ERROR="${AGY_ERROR:-null}"
RETRY="${AGY_RETRY_COUNT:-0}"
TOKEN="${AGY_TOKEN_ESTIMATE:-null}"
FILES="${AGY_FILES_MODIFIED:-[]}"

# --- Quote string fields, pass null/number fields as-is ---
quote() {
  if [ "$1" = "null" ] || [ -z "$1" ]; then
    printf 'null'
  else
    printf '"%s"' "$1"
  fi
}

# --- Build JSON line ---
JSON=$(printf '{"ts":"%s","event":"%s","model":%s,"phase":"%s","tool":%s,"files_modified":%s,"error":%s,"retry_count":%s,"token_estimate":%s}' \
  "$TS" \
  "$EVENT" \
  "$(quote "$MODEL")" \
  "$PHASE" \
  "$(quote "$TOOL")" \
  "$FILES" \
  "$(quote "$ERROR")" \
  "$RETRY" \
  "$TOKEN"
)

# --- Append to log ---
printf '%s\n' "$JSON" >> "$LOG_FILE"
