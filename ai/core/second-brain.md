# Second Brain

Persistent per-project knowledge base plus a shared dependency registry:

```
~/.dotfiles/ai/knowledge/<project-name>/        — architecture.md, adr.md,
  vocabulary.md, gotchas.md, wip.md
~/.dotfiles/ai/knowledge/_shared/dependencies/  — one file per dependency,
  with a project usage table
```

`<project-name>` resolution: match the workspace path in
`~/.dotfiles/ai/knowledge/_index.md`; fallback to the `basename` of `$PWD` at
session start.

**Read** the relevant knowledge files before starting work for Tier 2,
ambiguous, debugging/integration, or dependency tasks; skip for trivial Tier 1
(read only the files relevant to the current task).

**Write**: on session end, update the affected knowledge files if non-obvious
knowledge was discovered — decision → `adr.md`, dependency → `_shared/dependencies/`,
trap → `gotchas.md`, term → `vocabulary.md`, status → `wip.md`, structure →
`architecture.md`; else skip silently.

Format conventions and the on-demand indexing protocol: see
`~/.dotfiles/ai/skills/second-brain/SKILL.md`.
