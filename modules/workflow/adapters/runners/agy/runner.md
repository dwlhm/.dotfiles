---
name: agy
enforces: [read, edit, shell-report, shell-check, shell-git-read, shell-qa, network]
multiline: false
trust: false
models:
  - id: gemini-3.8-flash-low
    tier: small
    cost: 1
  - id: gemini-3.8-flash-medium
    tier: small
    cost: 1
  - id: gemini-4-argon-medium
    tier: medium
    cost: 3
  - id: gemini-4-argon-high
    tier: large
    cost: 5
---

Antigravity CLI (`agy -i "<prompt>"`), verified under hc 2026-10-31 (1.4.12): reports OSC 7501
itself (`app: antigravity`). At start it briefly reports `blocked kind:auth` and `idle` before it
takes the prompt; the engine's startup rule (nothing counts before the first `working`) covers it.

`multiline: false`: agy runs only the first line of a multi-line command (a heredoc body or a
newline inside quotes is dropped; verified 2026-10-31), so its report instruction asks for one line
with `--escaped` `\n` line breaks.

`--settings <json>` applies for that session only and is never saved. wf passes the run's folder in
`trustedWorkspaces` (no trust prompt) and the run's commands in `permissions.allow` (no permission
prompt). That alone does not isolate: the user's own grants and auto mode still let other commands
through (a probe's `touch` ran). So the `wf-worker` PreToolUse hook (`wf hook agy`, registered by
this module's activation) denies every tool and command outside the role. agy treats a hook reply
without a decision as deny, so the hook prints nothing for allowed calls and outside wf runs.
