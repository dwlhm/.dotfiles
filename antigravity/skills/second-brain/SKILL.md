---
name: second-brain
description: >
  How to read, write, and maintain the per-project second brain knowledge base.
  Activate when starting a Tier 2 task, when the user's intent is ambiguous,
  or when a session ends and new knowledge should be persisted.
---

# Second Brain Skill

## Storage Structure

```
~/notes/antigravity/<project-name>/
├── architecture.md   — high-level structure, layer boundaries, key patterns
├── adr.md            — active decisions: why X was chosen over Y
├── vocabulary.md     — domain terms, entity names, abbreviations
├── gotchas.md        — non-obvious traps, inconsistencies, known issues
├── wip.md            — current work-in-progress and its status
└── dependencies.md   — libraries used, for what purpose, version, usage notes
```

**Project name**: `basename` of `$PWD`. If `$PWD` is `/Users/dwlhm/project/my-app`,
the brain lives at `~/notes/antigravity/my-app/`.

---

## File Format Conventions

Each file follows the same pattern: a top-level heading, then dated entries in
reverse-chronological order (newest first). This keeps the most current context
at the top.

### `architecture.md`
```markdown
# Architecture — <project-name>

## <YYYY-MM-DD> Current State
<High-level description of layers, boundaries, and key patterns.>

### Layer Map
| Layer | Path | Responsibility |
|---|---|---|
| ... | ... | ... |
```

### `adr.md`
```markdown
# Decisions — <project-name>

## <YYYY-MM-DD> <Short title>
**Context**: Why was this decision needed?
**Decision**: What was chosen?
**Rationale**: Why this over alternatives?
**Consequences**: Known trade-offs.
```

### `vocabulary.md`
```markdown
# Vocabulary — <project-name>

| Term | Definition |
|---|---|
| ... | ... |
```

### `gotchas.md`
```markdown
# Gotchas — <project-name>

## <YYYY-MM-DD> <Short title>
**Symptom**: What does this look like when you hit it?
**Cause**: Why does it happen?
**Fix / Workaround**: What to do.
**File(s)**: Where it lives.
```

### `wip.md`
```markdown
# Work in Progress — <project-name>

## Active
- [ ] <task> — <status note> — started <YYYY-MM-DD>

## Recently Completed
- [x] <task> — completed <YYYY-MM-DD>
```

### `dependencies.md`
```markdown
# Dependencies — <project-name>

| Library | Version | Used For | Key Notes |
|---|---|---|---|
| ... | ... | ... | ... |
```

---

## Reading the Brain

Read only the files relevant to the current task. Do not read all six by default.

| Situation | Files to read |
|---|---|
| New session, task is Tier 2 | `architecture.md`, `wip.md` |
| Intent is ambiguous | `vocabulary.md`, `architecture.md` |
| Adding a dependency | `dependencies.md` |
| Debugging unexpected behavior | `gotchas.md` |
| Resuming previous work | `wip.md` |

Use `view_file` to read. The files are plain markdown — no special parsing needed.

---

## Writing the Brain

After any session where new knowledge was produced, update only the affected file(s).

**What counts as "significant enough" to write:**
- A decision that was not obvious and required reasoning → `adr.md`
- A library used in a non-default or non-obvious way → `dependencies.md`
- A bug or trap discovered that future work could hit again → `gotchas.md`
- A term used in the codebase that is project-specific → `vocabulary.md`
- A task that was started, progressed, or completed → `wip.md`
- A structural change to how the project is organized → `architecture.md`

**What does NOT need to be written:**
- Standard usage of well-known libraries (e.g., "we use React for UI")
- Obvious architectural choices that any developer would assume
- Transient state (e.g., a bug that was fixed and will never recur)

Use `write_to_file` with `Overwrite: true` to update a file. Prepend new entries
(newest first). Do not delete old entries unless they are factually wrong.

---

## Bootstrapping a New Project

On the first Tier 2 session for a project with no brain directory:

1. Create `~/notes/antigravity/<project-name>/`.
2. Scaffold all six files with their heading and an empty table or placeholder.
3. Populate whatever is known from the current session before ending.

Do this as a single write pass at the end of the session, not before starting work.
