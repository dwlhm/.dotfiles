---
description: Review a target and write notes, without editing
tier: medium
can: [read, shell-git-read, shell-report]
needs: [target]
reports: [done, stuck, question]
---
Review {{target}}.

Look for correctness bugs first, then broken contracts and missing edge cases, then cleanups.
For every finding give the file and line, what goes wrong, and a concrete scenario. Say plainly
when you found nothing. Do not edit files.

{{context}}
