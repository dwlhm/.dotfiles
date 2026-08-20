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
It runs on `model: flash`. Invoke it via `invoke_subagent`:

```
invoke_subagent("implementer", <brief>)
```

Do not define transient agents. Do not bypass the implementer for "quick" tasks.

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
| Implementer used wrong tools | Missing tool in frontmatter | Edit `implementer.md` frontmatter: add the missing tool |
| Poor output for a specific language | `flash` model limitation | Consider `model: pro` in `implementer.md` as last resort |

To edit the implementer:
```
~/.gemini/config/agents/implementer.md
```

Always test the change with a real task before concluding the fix worked.

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

| Scope | Path |
|---|---|
| Available in all projects | `~/.gemini/config/agents/<name>.md` |
| Available in one project | `.agents/agents/<name>.md` |

### Agent file template

```markdown
---
name: <name>
description: >-
  [Detailed description of what this agent does and when to invoke it.
  The orchestrator uses this description to decide which agent to delegate to.]
subagent: true
model: flash
tools:
  - view_file
  - [add only the tools this agent needs — no more]
commandExecutionPolicy: sandbox
---

# System Prompt

[Define the agent's role, rules, and completion report requirements.
Be specific. The agent cannot ask for clarification — it can only stop
and report back if blocked.]
```

### Model selection

| Value | When to use |
|---|---|
| `flash` | Default. Most implementation tasks. Cheaper, faster. |
| `pro` | Only when flash demonstrably fails and the task requires deep reasoning. |
| `inherit` | Inherits the parent's model. Avoid — defeats the cost-saving purpose. |

### After creating the file

```
invoke_subagent("<name>", <brief>)
```

The agent is immediately available without a session restart.

---

## 7. Anti-Patterns

| Anti-pattern | Why it's wrong |
|---|---|
| `define_subagent` for a one-off task | Transient — rebuilds from scratch every session |
| Creating a second general-purpose agent because implementer was slow | Duplication, not specialization |
| Forwarding the full conversation transcript in a brief | Pollutes context, increases cost |
| Using `model: pro` as a default | Defeats the token-saving purpose |
| Creating a specialized agent for a task that only happens once | Maintenance cost without benefit |
