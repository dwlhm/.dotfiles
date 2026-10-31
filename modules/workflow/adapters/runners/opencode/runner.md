---
name: opencode
enforces: [read, edit, shell-report, shell-check, shell-git-read, shell-qa, network]
multiline: true
trust: false
models:
  - id: opencode/deepseek-v4.1-flash-free
    tier: small
    cost: 0
  - id: opencode/beam-free
    tier: small
    cost: 0
---

OpenCode TUI (`opencode --standalone --prompt`), verified under hc 2026-10-31: reports OSC 7501
itself (`app: opencode`), needs no folder trust, and starts working on the prompt at once.

`--standalone` is required: without it every TUI attaches to one shared background service, so
two runs started together both ran with the first one's model and permissions and neither got
its prompt (each sat idle until `start_seconds`).

The config (model + permissions) is `OPENCODE_CONFIG_CONTENT` in the launch env; the host decides
how env reaches the terminal (hc prefixes argv with env(1), so hc's `agent` field says `env`; the
status still comes from opencode).

Permissions: every capability maps to an allow rule; everything else is denied, so a request
outside the role is refused to the model instead of prompting the user.
