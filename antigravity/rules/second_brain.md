# Second Brain

Each project has a persistent knowledge base stored at:

```
~/notes/antigravity/<project-name>/
├── architecture.md   — high-level structure, layer boundaries, key patterns
├── adr.md            — active decisions: why X was chosen over Y
├── vocabulary.md     — domain terms, entity names, abbreviations
├── gotchas.md        — non-obvious traps, inconsistencies, known issues
├── wip.md            — current work-in-progress and its status
└── dependencies.md   — libraries used, for what purpose, version, usage notes
```

`<project-name>` is the basename of `$PWD` at session start.

---

## Read Trigger

Read the relevant brain files **before starting work** when either condition is true:

1. The task is Tier 2 (architectural, cross-cutting, or spans multiple files), OR
2. The user's intent is ambiguous and context is needed to interpret it correctly.

Do NOT read the brain for clearly-scoped Tier 1 tasks. That adds latency without
benefit to the user.

Read only the files relevant to the current task, not all six.

---

## Write Trigger

At the end of a session, update the affected brain file(s) if any of the following
occurred during the session:

| Event | File to update |
|---|---|
| Architectural decision made or changed | `adr.md` |
| New library or dependency introduced | `dependencies.md` |
| Non-obvious bug, trap, or inconsistency found | `gotchas.md` |
| Domain term defined or clarified | `vocabulary.md` |
| Work-in-progress status changed | `wip.md` |
| High-level project structure changed | `architecture.md` |

If none of the above occurred, skip the update silently. No noise.

---

## Bootstrap

For a project with no existing brain directory, create the directory and all six
files on the first Tier 2 task or ambiguous session. Scaffold each file with a
minimal heading and a placeholder so its purpose is clear.

Refer to `skills/second-brain/SKILL.md` for format conventions.
