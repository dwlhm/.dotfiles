---
description: Do one step and nothing else
tier: small
can: [read, edit, shell-check, shell-report]
needs: [brief, only, check]
reports: [done, stuck, question, too_big]
---
Do exactly this: {{brief}}

Edit only these paths: {{only}}
The step is done when this passes: `{{check}}` (run it yourself; the engine runs it again).

Fix causes, not symptoms. Do not start other agents. If the step turns out to need more than one
focused change, stop and report `too_big` with the sub-steps you propose. If the goal is unclear
(what/why), report `question` instead of guessing.

{{feedback}}

{{context}}
