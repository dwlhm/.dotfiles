# Skill & Core Rule Graduation Candidates

Staging registry for recurring gotchas, architectural patterns, and workflow idioms observed across $\ge 2$ projects. Once validated across multiple repositories, entries here graduate into canonical skills (`ai/skills/<name>/SKILL.md`) or core rules (`ai/core/<name>.md`).

---

## Active Candidates

| Candidate Name | Category | Originating Projects / Stacks | Recurring Gotchas | Graduation Target | Status |
|---|---|---|---|---|---|
| **macOS Native Windowing & Vibrancy** | UI / Platform | `titik`, `runa` | `mac-01`, `mac-03`, `mac-06` | Canonical Skill (`ai/skills/macos-windowing`) | Staged |
| **Hermetic Async Testing** | Quality / CI | `titik`, `runa`, `teras` | `sw-07`, `sw-09`, `sh-02` | Core Rule update (`ai/core/code-quality.md`) | Staged |
| **High-Frequency Input Decoupling** | Concurrency | `titik`, `teras`, `term` | `sw-03`, `sw-06`, `ttk-01` | Canonical Skill (`ai/skills/interactive-latency`) | Staged |

---

## Graduation Criteria

1. **Recurrence**: Observed and solved in $\ge 2$ distinct project codebases.
2. **Invariance**: Root cause and resolution are universally applicable, not project-specific business logic.
3. **Completeness**: Documented with Result, Crack, Need, and verified code anchors.
4. **Actionability**: Formulated as concrete directives or workflow templates rather than passive observations.
