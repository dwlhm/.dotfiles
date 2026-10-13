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

```
~/.dotfiles/ai/knowledge/
├── _index.md               — master project path registry & tech stacks
├── _meta/                  — cross-harness and meta-level intelligence
│   ├── heuristics.md       — harness capabilities, token optimization tactics, model strengths
│   └── candidates.md       — recurring patterns staged for graduation into canonical skills
├── _shared/
│   ├── gotchas/            — ecosystem-partitioned technical gotchas (one file per stack)
│   │   ├── macos.md        — Cocoa, AppKit, Metal, Carbon, Darwin PTY, SkyLight
│   │   ├── odin.md         — memory arenas, dynamic arrays, C ABI, SIMD
│   │   ├── swift.md        — Swift 6 concurrency, actors, SwiftUI structural identity
│   │   ├── android.md      — Jetpack Compose, AppWidgets, Android SQLite
│   │   ├── web.md          — SharedArrayBuffer, Web Workers, Vite, RSC, React 19
│   │   └── shell.md        — Zsh, macOS sandbox, runner CI/CD, Git submodules
│   └── dependencies/       — cross-project dependency usage registry
│       ├── effect.md
│       └── vite.md
└── <project-name>/         — per-project isolated knowledge
    ├── architecture.md     — high-level structure, layer boundaries, key patterns
    ├── adr.md              — active decisions: why X was chosen over Y
    ├── vocabulary.md       — domain terms, entity names, abbreviations
    ├── gotchas.md          — project-specific traps & closed proprietary issues
    └── wip.md              — current work-in-progress and its status
```

### Shared Knowledge

1. **Ecosystem Gotchas (`_shared/gotchas/<ecosystem>.md`)**:
   General technical pitfalls applicable to any project within that ecosystem.
2. **Dependency Registry (`_shared/dependencies/<lib>.md`)**:
   One file per library with a table of all projects that use that dependency:

```markdown
# dependency-name

| Project | Version | Purpose | Notes |
|---|---|---|---|
| project-a | ^3.0.0 | FP runtime | |
| project-b | ^5.x | Type safety | |
```

### Meta Knowledge (`_meta/`)

1. **`heuristics.md`**: Harness-specific behavioral quirks, token optimization tactics, and model strength matrices.
2. **`candidates.md`**: Staging area for recurring patterns and technical solutions observed across $\ge 2$ projects destined for promotion to canonical skills or core rules.

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

## Simple Terms
**<Term>**: <One-line definition.> → `<code/reference>`

## Design & Architecture Terms
### <Term>
**What it is**: <One-sentence description of visual outcome or UI behavior.>
**Invariants**:
- <Must-have property>
**Anti-Patterns**:
- <Forbidden implementation>
**Source**: <ADR, HIG, spec, or code symbol @ file>
```

### `gotchas.md` (Project Gotchas)
```markdown
# Gotchas — <project-name>

## [<id>] <YYYY-MM-DD> <Short title> [Status: Provisional | Verified] [Agent: <harness>]
**Symptom**: What does this look like when you hit it?
**Cause**: Why does it happen?
**Workaround**: What to do.
**Files**: Where it lives (`symbol @ file:line`).
```

### `_shared/gotchas/<ecosystem>.md` (Shared Ecosystem Gotchas)
```markdown
# Gotchas — <ecosystem>

## [<id>] <YYYY-MM-DD> <Short title> [Status: Provisional | Verified] [Agent: <harness>]
**Symptom**: What does this look like when you hit it?
**Cause**: Why does it happen?
**Workaround**: What to do.
**Anchors**: Verifiable code symbol, platform API, or toolchain version.
```

#### ID Prefix Conventions
To keep gotcha retrieval token-minimal and collision-free across files, use standard prefix IDs:
- macOS (Cocoa, AppKit, Metal, SkyLight): `mac-01`, `mac-02`, ...
- Odin (Memory arenas, dynamic arrays, C ABI): `odin-01`, `odin-02`, ...
- Swift (Swift 6 concurrency, actors, SwiftUI): `sw-01`, `sw-02`, ...
- Android (Compose, AppWidgets, Android SQLite): `and-01`, `and-02`, ...
- Web (SharedArrayBuffer, Web Workers, Vite, RSC): `web-01`, `web-02`, ...
- Shell / CI (Zsh, sandbox, runner CI/CD, submodules): `sh-01`, `sh-02`, ...
- Project-specific gotchas: `<project-prefix>-01` (e.g. `ttk-01` for Titik) or sequential numbers.

### `wip.md`
```markdown
# Work in Progress — <project-name>

## Active
- [ ] <task> — <status note> — started <YYYY-MM-DD>

## Recently Completed
- [x] <task> — completed <YYYY-MM-DD>
```

---

## 2-Question Decision Rule (Gotchas Taxonomy)

When capturing or consulting a trap, bug, or failure mode:
1. **Question 1 (General Technical)**: Could another developer or agent building a completely different app in this same language/framework/platform hit this exact same problem?
   - If **YES** → Route to `~/.dotfiles/ai/knowledge/_shared/gotchas/<ecosystem>.md`.
2. **Question 2 (Project Business)**: Is this problem strictly bound to this project's unique business logic, internal database schema, or closed proprietary workflow?
   - If **YES** → Route to `~/.dotfiles/ai/knowledge/<project-name>/gotchas.md`.

---

## Graduation Protocol

When a technical gotcha, architectural pattern, or workflow workaround recurs in $\ge 2$ projects:
1. Tag it in `~/.dotfiles/ai/knowledge/_meta/candidates.md` with pointers to the originating projects and gotcha IDs.
2. Evaluate for graduation into:
   - A canonical skill (`ai/skills/<name>/SKILL.md`) if it defines an actionable workflow or deep domain procedure.
   - A core rule (`ai/core/<name>.md`) if it defines a mandatory cross-cutting engineering invariant.

---

## Reading the Brain (Surgical & Low-Token)

**Prefer the `kb` CLI tool**:
Do not dump entire knowledge files into the context window. Use `ai/scripts/kb` via `run_command` for ultra-compact retrieval:
- `ai/scripts/kb context [project]` — JIT smart briefing (< 250 tokens) resolving current project, stack, and relevant gotcha headlines.
- `ai/scripts/kb list [stack]` — returns one-line headlines (`[<id>] <title> [<status>]`) (40-80 tokens).
- `ai/scripts/kb search <query> [--stack <stack>]` — fuzzy search powered by `fzf --filter` across headlines.
- `ai/scripts/kb get <stack> <id>` — surgical fetch of a single gotcha entry (< 100 tokens).

| Situation | Recommended Action |
|---|---|
| New session, Tier 2 task | Run `ai/scripts/kb context <project>` |
| Debugging stack-specific trap | Run `ai/scripts/kb search "<query>" --stack <stack>` then `kb get <stack> <id>` |
| Adding or changing a dependency | Read `_shared/dependencies/<lib>.md` directly |
| Checking domain terms / vocabulary | Read `<project>/vocabulary.md` directly |
| Resuming previous work | Read `<project>/wip.md` directly |

---

## Writing the Brain (Event-Driven)

At the end of any session where non-obvious knowledge, ADRs, vocabulary, dependencies, or gotchas were discovered or modified, update only the affected file(s). This is event-driven and applies regardless of task tier.

**What counts as "significant enough" to write:**
- A decision that was not obvious and required reasoning → `<project>/adr.md`
- A library used in a non-default or non-obvious way → `_shared/dependencies/<lib>.md` (create file if new, append row if exists)
- A bug or trap discovered that future work could hit again → `_shared/gotchas/<ecosystem>.md` (if general per 2-question rule) or `<project>/gotchas.md` (if project-specific); prefer `ai/scripts/kb add`
- A term used in the codebase that is project-specific → `<project>/vocabulary.md`
- A task that was started, progressed, or completed → `<project>/wip.md`
- A structural change to how the project is organized → `<project>/architecture.md`

**What does NOT need to be written:**
- Standard usage of well-known libraries (e.g., "we use React for UI")
- Obvious architectural choices that any developer would assume
- Transient state (e.g., a bug that was fixed and will never recur)

### Vocabulary Quality Gate

Before writing any entry to `<project>/vocabulary.md`, enforce this quality gate:

1. **Classify the term**:
   - **Domain noun** (entity, component name, proper noun): write a one-line definition and code reference under `## Simple Terms`.
   - **Design/architecture term** (visual effect, rendering technique, UI behavior, pattern): requires canonical research and expanded format under `## Design & Architecture Terms`.
2. **Conduct canonical research**: For design/architecture terms, you MUST research canonical sources (ADRs, implementation code, platform HIG, or trigger the Named Methodology Gate in `gates.md`) before writing.
3. **Enforce invariants and anti-patterns**: Expanded entries MUST include both `Invariants` (mandatory properties) and `Anti-Patterns` (forbidden implementations). Any design entry missing anti-patterns is INVALID — return and research further.

Edit the file to update existing entries; write the file to create new ones. Prepend new entries (newest first) in dated files; maintain section grouping in vocabulary files.

**Deprecation**: Delete or update entries that are factually wrong or no longer relevant. Stale entries that contradict current code are more harmful than no entry — remove them.

## General Write Gate

Before writing to ANY file in the second brain, enforce this gate:

1. **Deduplication check**: Read the target file first. If a similar entry already exists → update it in-place. Do not append a duplicate.
2. **Precision gate**: Every entry MUST include:
   - At least one concrete anchor: `symbol @ file:line`, dependency version, or observation date
   - Factual content — no opinions, no vague prose
   - File-type completeness (gotchas: Symptom+Cause+Workaround; adr: Context+Decision+Rationale)
   Entries missing an anchor = INVALID. Do not write.
3. **Contradiction check**: If the new entry contradicts an existing entry in any other second-brain file → resolve the contradiction before writing. Flag it, update the stale entry, then write the new one.

## Staleness Protocol

When reading the brain and finding an entry that contradicts actual code:
1. Add `> [!WARNING] Stale — contradicted by <symbol @ file:line>` directly below the entry heading
2. Do not use the stale entry as a basis for any decision
3. At the end of the session: update the entry with correct information, or delete it if irrelevant

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
