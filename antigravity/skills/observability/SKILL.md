---
name: observability
description: >
  How to read and interpret session telemetry logs produced by the custom
  JSONL logger. Use when reviewing agent activity, debugging unexpected
  behavior, or analyzing cost and error patterns across sessions.
---

# Observability Skill

## Log Location

```
~/logs/antigravity/<project-name>/session-<YYYY-MM-DD>.jsonl
```

Project name is the `basename` of `$PWD` at session time. One file per day per
project. New events are appended to the file; existing events are never modified.

---

## Event Schema

Each line is a single JSON object:

```json
{
  "ts":                "<ISO8601 timestamp>",
  "event":             "pre_invocation | post_invocation | stop | post_tool",
  "model":             "<model-id or null>",
  "phase":             "analysis | implementation | unknown",
  "tool":              "<tool_name or null>",
  "files_modified":    ["<path>", ...],
  "error":             null | "<error message>",
  "retry_count":       0,
  "token_estimate":    null | <number>
}
```

| Field | Notes |
|---|---|
| `ts` | ISO8601 with timezone offset. |
| `event` | Lifecycle point where the hook fired. |
| `model` | Model ID active at hook time; `null` if not available from env. |
| `phase` | Set by the agent via env var `AGY_PHASE` (`analysis` or `implementation`). Defaults to `unknown`. |
| `tool` | Tool name for `post_tool` events; `null` for invocation-level events. |
| `files_modified` | List of absolute paths written during a `post_tool` event; empty otherwise. |
| `error` | Error message if the tool or invocation failed; `null` on success. |
| `retry_count` | Number of retries attempted. |
| `token_estimate` | Token count if exposed by the runtime; `null` if not available. |

---

## Reading Logs

To read the current session log:
```bash
cat ~/logs/antigravity/<project>/session-$(date +%Y-%m-%d).jsonl
```

To pretty-print (requires `jq`):
```bash
cat ~/logs/antigravity/<project>/session-$(date +%Y-%m-%d).jsonl | jq .
```

To filter for errors only:
```bash
cat ~/logs/antigravity/<project>/session-$(date +%Y-%m-%d).jsonl | jq 'select(.error != null)'
```

To see files modified in a session:
```bash
cat ~/logs/antigravity/<project>/session-$(date +%Y-%m-%d).jsonl \
  | jq '[.files_modified[]] | unique'
```

To see model usage per phase:
```bash
cat ~/logs/antigravity/<project>/session-$(date +%Y-%m-%d).jsonl \
  | jq '{phase, model} | select(.model != null)' | sort | uniq -c
```

---

## Hook Script Location

The script that writes these logs is at:
```
~/.gemini/config/hooks/log-hook.sh
```

It is called by `hooks.json` on `PreInvocation`, `PostInvocation`, `Stop`,
and `PostToolUse` lifecycle events. It does one thing: append one JSON line.
