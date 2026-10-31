---
name: claude
enforces: [read, edit, shell-report, shell-check, shell-git-read, shell-qa, network]
multiline: true
trust: true
start_seconds: 60
models:
  - id: claude-haiku-5-5
    tier: small
    cost: 2
  - id: claude-sonnet-5-5
    tier: medium
    cost: 4
  - id: claude-opus-5-5
    tier: large
    cost: 8
---

Claude Code TUI (`claude … -- "<prompt>"`), verified under hc 2026-10-31 (2.1.295): reports
OSC 7501 itself (`app: claude-code`), but only after the folder is trusted.

Isolation: `--restricted` ignores the user's settings files (their allow lists and hooks),
`--strict-mcp-config` loads no MCP server, `--tools` makes only the role's tools exist, and
`--permission-mode dontAsk` denies every call no rule allows, without prompting. Verified: with
only `Bash(git status:*)` allowed, `touch`, `curl` and `rm` were denied and no file could be
written; Claude Code's own read-only commands (`echo`, `cat`, …) still run, which `read` covers.

Trust lives in `~/.claude.json` (`projects[path].hasTrustDialogAccepted`) and covers subfolders.
`trust()` only reads it: Claude Code rewrites that file, so wf never writes it. An untrusted folder
makes the run fail as `infra` (the next runner takes over) with the fix in the reason.
