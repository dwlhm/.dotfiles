---
description: Break a goal into small, checkable steps
tier: medium
can: [read, shell-git-read, shell-report]
needs: [goal, check]
reports: [done, stuck, question]
writes: plan
---
Goal: {{goal}}
The whole goal is proven when this passes: `{{check}}`

Read the code first, then plan. Do not edit anything.

Report the plan, and nothing else, as blocks like this (one blank line between blocks):

    step: <the one outcome of this step, as one sentence>
    only: <the paths this step may edit, comma separated>
    check: <a command that proves this step is done>
    after: <numbers of the steps it needs first, e.g. 1, 2; leave out when none>
    qa: <a UI test command, only for a step that changes UI>

Rules the engine enforces (a plan breaking one comes back to you with the reason):
- every step has `step`, `only` and `check`;
- `after` names earlier steps only;
- steps that can run at the same time (neither needs the other) must have `only` paths that do
  not overlap;
- when steps share a type, interface or schema, make that contract step 1 and let the others
  come after it;
- keep it short; for a goal too big to plan in detail, detail the first milestone and add one
  final line `later: <what remains, one sentence>`.

Ask (`question`) only when the goal itself is ambiguous (what/why); decide how yourself.

{{feedback}}

{{context}}
