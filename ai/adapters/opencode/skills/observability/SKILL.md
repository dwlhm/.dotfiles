---
name: observability
description: >
  How to read and interpret session telemetry logs produced by the opencode
  session-log plugin. Use when reviewing agent activity, debugging unexpected
  behavior, or analyzing cost and error patterns across sessions.
---

# Observability Skill

## Log Location

```
~/logs/opencode/<project-name>/session-<YYYY-MM-DD>.jsonl
```

Project name is the `basename` of the session working directory. One file per
day per project. New events are appended to the file; existing events are never
modified.

---

## Event Schema

Each line is a single JSON object:

```json
{
  "ts":                "<ISO8601 timestamp>",
  "event":             "pre_invocation | post_tool | stop | session_error",
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
| `ts` | ISO8601 timestamp. |
| `event` | Lifecycle point where the plugin fired. |
| `model` | Model ID active at event time; `null` if not available. |
| `phase` | Set via env var `OPENCODE_PHASE` (`analysis` or `implementation`). Defaults to `unknown`. |
| `tool` | Tool name for `post_tool` events; `null` for invocation-level events. |
| `files_modified` | Paths extracted from `write`/`edit` tool arguments; empty otherwise. |
| `error` | Error message if the tool or session failed; `null` on success. |
| `retry_count` | Number of retries attempted. |
| `token_estimate` | Token count if exposed by the runtime; `null` if not available. |

---

## Reading Logs

To read the current session log:
```bash
cat ~/logs/opencode/<project>/session-$(date +%Y-%m-%d).jsonl
```

To pretty-print (requires `jq`):
```bash
cat ~/logs/opencode/<project>/session-$(date +%Y-%m-%d).jsonl | jq .
```

To filter for errors only:
```bash
cat ~/logs/opencode/<project>/session-$(date +%Y-%m-%d).jsonl | jq 'select(.error != null)'
```

To see files modified in a session:
```bash
cat ~/logs/opencode/<project>/session-$(date +%Y-%m-%d).jsonl \
  | jq '[.files_modified[]] | unique'
```

To see tool usage frequency:
```bash
cat ~/logs/opencode/<project>/session-$(date +%Y-%m-%d).jsonl \
  | jq 'select(.tool != null) | .tool' | sort | uniq -c
```

---

## Plugin Location

The code that writes these logs is at:

```
~/.config/opencode/plugin/session-log.ts
```

(symlinked from `~/.dotfiles/ai/adapters/opencode/plugin/session-log.ts`)

opencode auto-discovers plugins in `~/.config/opencode/plugin/`. It listens to
`chat.message` (pre_invocation), `tool.execute.after` (post_tool), and bus
events `session.idle` (stop) / `session.error` (session_error). It does one
thing: append one JSON line. Restart opencode after editing the plugin.
