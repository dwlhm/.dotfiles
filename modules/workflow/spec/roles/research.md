---
description: Answer a question from the code and the docs, without editing
tier: small
can: [read, shell-git-read, shell-report]
needs: [question, about]
reports: [done, stuck, question]
---
Question: {{question}}
Look at: {{about}}

Answer from what you actually read; cite files and lines. Separate what you verified from what
you infer. Do not edit files.

{{context}}
