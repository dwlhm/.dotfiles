---
name: second-brain
description: >
  How to read, write, and maintain the knowledge base. Activate when starting a
  Tier 2 task, when the user's intent is ambiguous, when debugging traps or
  integrating third-party platforms, or when a session ends and new knowledge
  should be persisted.
---

# Second Brain Skill

## Storage Structure

### Project-Specific Knowledge

Each project has its own directory:

```
~/.dotfiles/ai/knowledge/<project-name>/
├── architecture.md   — high-level structure, layer boundaries, key patterns
├── adr.md            — active decisions: why X was chosen over Y
├── vocabulary.md     — domain terms, entity names, abbreviations
├── gotchas.md        — non-obvious traps, inconsistencies, known issues
└── wip.md            — current work-in-progress and its status
```

### Shared Knowledge

A single dependency registry, one file per library:

```
~/.dotfiles/ai/knowledge/_shared/dependencies/
├── effect.md
├── vite.md
└── ...
```

Each file contains a table of all projects that use that dependency:

```markdown
# dependency-name

| Project | Version | Purpose | Notes |
|---|---|---|---|
| project-a | ^3.0.0 | FP runtime | |
| project-b | ^5.x | Type safety | |
```

## `<project-name>` Resolution

To determine `<project-name>`:
1. Check `~/.dotfiles/ai/knowledge/_index.md` for a matching workspace directory path.
2. If not registered in `_index.md`, fallback to the `basename` of `$PWD` at session start.

---

## File Format Conventions

Each file follows the same pattern: a top-level heading, then dated entries in reverse-chronological order (newest first). This keeps the most current context at the top.

### `architecture.md`
```markdown
# Architecture — <project-name>

## <YYYY-MM-DD> Current State
<High-level description of layers, boundaries, and key patterns.>

### Layer Map
| Layer | Path | Responsibility |
|---|---|---|
| ... | ... | ... |

### Key Patterns
- **<Pattern Name>**: <Description and application in codebase>
```

### `adr.md`
```markdown
# Decisions — <project-name>

## <YYYY-MM-DD> <Short title>
**Context**: Why was this decision needed?
**Decision**: What was chosen?
**Rationale**: Why this over alternatives?
**Consequences**: Known trade-offs and implications.
```

### `vocabulary.md`
```markdown
# Vocabulary — <project-name>

| Term | Definition | Code References |
|---|---|---|
| ... | ... | ... |
```

### `gotchas.md`
```markdown
# Gotchas — <project-name>

## <YYYY-MM-DD> <Short title>
**Symptom**: What does this look like when you hit it?
**Cause**: Why does it happen?
**Workaround**: What to do.
**Files**: Where it lives.
```

### `wip.md`
```markdown
# Work in Progress — <project-name>

## Active
- [ ] <task> — <status note> — started <YYYY-MM-DD>

## Recently Completed
- [x] <task> — completed <YYYY-MM-DD>
```

---

## Reading the Brain

Read only the files relevant to the current task. Do not read all files by default. Avoid upfront reads for trivial Tier 1 tasks.

| Situation | Files to read |
|---|---|
| New session, task is Tier 2 | `<project>/architecture.md`, `<project>/wip.md` |
| Intent is ambiguous / Domain context needed | `<project>/vocabulary.md`, `<project>/architecture.md` |
| Adding or changing a dependency | `_shared/dependencies/<lib>.md` |
| Debugging unexpected behavior | `<project>/gotchas.md` |
| Integrating third-party platforms | `<project>/architecture.md`, `<project>/gotchas.md` |
| Resuming previous work | `<project>/wip.md` |

Read the files directly. They are plain markdown — no special parsing needed.

---

## Writing the Brain (Event-Driven)

At the end of any session where non-obvious knowledge, ADRs, vocabulary, dependencies, or gotchas were discovered or modified, update only the affected file(s). This is event-driven and applies regardless of task tier.

**What counts as "significant enough" to write:**
- A decision that was not obvious and required reasoning → `<project>/adr.md`
- A library used in a non-default or non-obvious way → `_shared/dependencies/<lib>.md` (create file if new, append row if exists)
- A bug or trap discovered that future work could hit again → `<project>/gotchas.md`
- A term used in the codebase that is project-specific → `<project>/vocabulary.md`
- A task that was started, progressed, or completed → `<project>/wip.md`
- A structural change to how the project is organized → `<project>/architecture.md`

**What does NOT need to be written:**
- Standard usage of well-known libraries (e.g., "we use React for UI")
- Obvious architectural choices that any developer would assume
- Transient state (e.g., a bug that was fixed and will never recur)

Edit the file to update existing entries; write the file to create new ones. Prepend new entries (newest first). Do not delete old entries unless they are factually wrong.

---

## On-Demand Indexing Protocol

When the user requests to index an unindexed repository or bootstrap knowledge:

1. **Read-Only Scan**:
    Perform a read-only scan of the target repo:
    - Manifests and config files (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, etc.)
    - Entrypoints and routing (`src/index.ts`, `main.go`, `app/`, etc.)
    - Data models, schemas, and core type definitions
    - External APIs, third-party integrations, and environment variable requirements

2. **Scaffold Project Knowledge Base**:
    Create `~/.dotfiles/ai/knowledge/<project-name>/` and scaffold initial files (`architecture.md`, `vocabulary.md`, `gotchas.md`, `adr.md`, `wip.md`) using templates from `~/.dotfiles/ai/knowledge/_template/` or populated with findings from the scan.

3. **Scaffold Dependencies**:
    For each dependency found in the target repo, create or update a file in `~/.dotfiles/ai/knowledge/_shared/dependencies/<dep-name>.md` with a table row for the current project.

4. **Register Index**:
    Add or update the project entry in `~/.dotfiles/ai/knowledge/_index.md` with workspace path, tech stack, and timestamp.

5. **Guarantee Target Repo Isolation**:
    Maintain strict read-only access to the target workspace during indexing — ZERO files should be created, altered, or deleted in the target repository.
