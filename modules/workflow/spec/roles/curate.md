---
description: Turn what landed work proved into knowledge entries
tier: small
can: [read, shell-report]
needs: [evidence]
reports: [done, stuck]
after: true
writes: knowledge
---
Here is what finished work did, what failed on the way, and how it was checked:

{{evidence}}

Propose knowledge entries only for technical facts this evidence proves: a platform or tool quirk,
the root cause of a bug, a verified behavior. Never record a decision, a preference, a plan or a
guess, and nothing the code itself already says plainly. Most work proves nothing worth keeping:
then report exactly `nothing`.

Otherwise report one entry per line, nothing else, in exactly one of these forms:

    project: <one or two sentences, true for this repository>
    topic <name>: <one or two sentences, true beyond this repository>

`<name>` is a short lowercase topic such as `git`, `bun` or `swiftui`.

{{context}}
