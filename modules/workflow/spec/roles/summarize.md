---
description: Compare several agents' answers to one question
tier: medium
can: [read, shell-report]
needs: [question, answers]
reports: [done, stuck]
---
Question: {{question}}

Several agents answered it independently:

{{answers}}

Compare them. Say where they agree, where they differ and which claims are backed by files and
lines they cite; check a disputed claim in the code yourself when you can. End with the answer you
would give, and say which agent's answer is closest to it. Do not edit files.

{{context}}
