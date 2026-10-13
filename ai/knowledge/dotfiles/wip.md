# Work in Progress — Dotfiles

## Active

(none)

## Recently Completed

- [x] Inlined agent stubs & implementer execution optimizations (ADR-005) — completed 2026-09-15 — sync.sh now inlines canonical agent bodies directly into machine config stubs (~/.gemini/config/agents/, ~/.config/opencode/agent/, ~/.pi/agent/agents/) to eliminate pointer-stub view_file overhead; implementer.md updated with Batch Execution, Single End-of-Task Verification, and No AI Config Reading rules; docs, gotchas, and ADR-005 recorded.
- [x] pi compliance with canonical ai/ architecture — completed 2026-09-08 — sync.sh now generates pi stubs (~/.pi/agent/agents/); example agents + ai/prompts/ removed; pi adapter rewritten to Zero Direct Mutation + architect/implementer/git-manager delegation; README updated; verified e2e (architect child enforced its canonical body format).
- [x] Remove paus from pi entirely — completed 2026-09-08 — mcp.json emptied; wrongly-ported orchestrator extension + skill deleted (user correction: no feature migration); pi now aligns to ~/.dotfiles/ai rules only.
- [x] pi agent config review + subagent capability — completed 2026-09-08 — installed official subagent extension (dotfiles copies + symlinks, model inheritance), updated AGENTS.md to Lead-Orchestrated pipeline, corrected review finding #1 (grep/find/ls ARE built-in). Uncommitted changes remain in the dotfiles git repo from before this session (ai/README.md, core/code-review.md, core/design-thinking.md, agents/implementer.md, adapters/antigravity/GEMINI.md) plus this session's new files — commit pending.
