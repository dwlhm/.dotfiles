---
name: subagent-management
description: >-
  Cheatsheet for briefing, running, assessing, and improving subagents.
  Use when delegating tasks to the implementer, evaluating output quality,
  deciding whether to improve the implementer or create a specialized agent,
  and writing persistent agent definition files.
---

# Sub-Agent Management

## 1. The Default: Always Use `implementer`

The `implementer` is the default delegation target for ALL execution work.
Invoke the `implementer` subagent via the harness's subagent delegation
mechanism — invocation syntax is defined in your harness entry file
(AGENTS.md / GEMINI.md / CLAUDE.md).

Do not spawn ad-hoc general-purpose subagents. Do not bypass the implementer
for "quick" tasks.

---

## 2. Briefing Template

Every brief to the `implementer` MUST include these four sections.
Omitting any section risks the implementer filling gaps with assumptions.

```
## Goal
[One sentence. What is the end state? Not the steps — the outcome.]

## Context
- Files involved: [list absolute paths]
- Relevant line ranges: [e.g. L45-L78 in foo.ts]
- Key constraints: [naming conventions, APIs to use/avoid, existing patterns]
- Plan reference: [attach or summarize the approved implementation_plan.md section]

## Exact Changes Required
[Enumerate every file change. Be specific: "In foo.ts, replace function X with Y.
Add import Z at line 3. Do not touch anything outside of these bounds."]

## Acceptance Criteria
[How to verify the task is done correctly. Include: commands to run, expected
output, files that must exist, lint/test commands that must pass.]
```

**Keep briefs focused.** Do NOT forward the full conversation transcript.
Pass only what the implementer needs to execute the task.

---

## 3. Assessing Implementer Output

When the implementer returns, check:

| Check | Pass condition |
|---|---|
| Delta Report present | States zero deviations OR lists every deviation explicitly |
| Acceptance criteria met | All criteria from the brief are satisfied |
| No scope creep | Only the specified files were touched |
| Conventions preserved | Surrounding code style not broken |
| Verification passed | Lint/tests ran and passed (if specified) |

If all pass → mark task done, update second brain if applicable.

If any fail → see §4 below.

---

## 4. When Implementer Output is Poor

**Do NOT create a new general-purpose agent.** Diagnose the failure first.

### Common failure modes and fixes

| Failure | Root cause | Fix |
|---|---|---|
| Implementer guessed instead of stopping | System prompt not strict enough | Edit `implementer.md`: reinforce "stop and report" rule |
| Wrong code style or conventions | Brief was missing context | Improve the briefing template (§2) — add convention examples |
| Implementer deviated from plan | Plan was ambiguous | Fix the plan quality (§0 pipeline) — not the implementer |
| Implementer used wrong tools | Missing tool permission | Adjust the per-harness `permission` frontmatter in `ai/scripts/sync.sh` |
| Poor output quality across the board | Model underpowered for the task | Pin a stronger `model` in the per-harness frontmatter in `ai/scripts/sync.sh` as last resort |

To edit the implementer:

```
~/.dotfiles/ai/agents/implementer.md
```

Always test the change with a real task before concluding the fix worked.
Note: harnesses load agent stubs at startup — see your harness entry file
for reload requirements.

---

## 5. When to Create a Specialized Agent

A new persistent agent is warranted ONLY when ALL of the following are true:

1. The task domain is genuinely different from general implementation
   (e.g., browser automation, database migrations, security auditing)
2. The required toolset, model tier, or system prompt is fundamentally incompatible
   with the `implementer`
3. The domain is recurring — not a one-time edge case

**If in doubt, use the `implementer`.** Specialization has a maintenance cost.

---

## 6. Creating a Persistent Specialized Agent

### File locations

| What | Path |
|---|---|
| Agent body (pure prompt, no frontmatter) | `~/.dotfiles/ai/agents/<name>.md` |
| Per-harness frontmatter (description, mode, permissions, tools, model) | `~/.dotfiles/ai/scripts/sync.sh` |
| Generated stubs in machine config | Written by `~/.dotfiles/ai/scripts/sync.sh` |

### Agent body template

```markdown
[Define the agent's role, rules, and completion report requirements.
Be specific. The agent cannot ask for clarification — it can only stop
and report back if blocked. The body becomes the agent's system prompt.]
```

Bodies are PURE prompts — no frontmatter of any kind. The per-agent
description and all harness-specific frontmatter (`mode`, `permission`,
`model`, `tools`, ...) are defined in `ai/scripts/sync.sh` and injected
into the generated stubs.

### Model selection

| Value | When to use |
|---|---|
| *(unset)* | Default. Inherits the user's configured model. |
| Cheaper capable model | Pin one for execution work when the user's default is expensive. |
| Stronger model | Only when the default demonstrably fails and the task requires deep reasoning. |

### After creating the agent

1. Write the pure body to `~/.dotfiles/ai/agents/<name>.md`.
2. Add its description and per-harness frontmatter to `ai/scripts/sync.sh`.
3. Run `~/.dotfiles/ai/scripts/sync.sh` to regenerate stubs into machine
   config. This is required only when adding, removing, or renaming an
   agent — editing an existing body needs no re-sync.
4. Load requirements are harness-specific — see your harness entry file
   (e.g. restart requirements). Then invoke the `<name>` subagent via the
   harness's subagent delegation mechanism.

---

## 7. Anti-Patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Spawning a one-off `general` subagent for a task the implementer can do | Transient — rebuilds from scratch every time |
| Creating a second general-purpose agent because implementer was slow | Duplication, not specialization |
| Forwarding the full conversation transcript in a brief | Pollutes context, increases cost |
| Pinning an expensive model as a default | Defeats the cost-saving purpose |
| Creating a specialized agent for a task that only happens once | Maintenance cost without benefit |
| Invoking a newly added agent without ensuring the harness loaded it | Agent stub is not loaded yet — invocation fails or uses stale config (see harness entry) |
