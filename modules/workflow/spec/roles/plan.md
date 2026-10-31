---
description: Break a goal into small, checkable steps
tier: medium
can: [read, shell-git-read, shell-report]
needs: [goal]
reports: [done, stuck, question]
---
Goal: {{goal}}

Read the code first, then propose a plan. Do not edit anything.

Each step must have:
- one outcome, written as one sentence;
- `only`: the paths it may edit, never overlapping a step that can run at the same time;
- `check`: a command that proves the step is done;
- `deps`: the steps it waits for.

When steps share a type, interface or schema, make that contract the first step and let the
others depend on it. Keep the plan short; for a goal too big to plan in detail, plan the first
milestone in detail and the rest as one line each.

Ask (`question`) only when the goal itself is ambiguous (what/why); decide how yourself.

{{context}}
