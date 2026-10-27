---
name: context-sync
description: >-
  Audits and synchronizes project context documentation in ~/brain/projects/
  and platform knowledge in ~/brain/knowledge/ against the live repository
  structure, Makefile/Package.swift targets, features, and DesignSystem symbols.
  Activate automatically during Definition of Done when [STALE DOC] is reported
  by ai-outline, after adding/renaming modules or components, or after discovering
  verified technical facts / user architectural corrections.
---

# Context Sync & Self-Improvement Skill (`context-sync`)

Keep `~/brain/projects/<project>.md` and `~/brain/knowledge/<topic>.md` 100% accurate and continuously self-improving without waiting for user prompts.

## Steps

### 1. Run Live Drift Detection

Run the helper script against the target project repository:

```bash
ai-outline --check-doc /path/to/project
```

* If it outputs `[DOC OK]`, no structural drift was detected.
* If it outputs `[STALE DOC]`, inspect the exact missing/stale items listed in the output.

### 2. Inspect Live Symbols Without Full-File Reads

To inspect symbols and exact line ranges in any changed module, feature, or `DesignSystem` folder:

```bash
ai-outline /path/to/project/module_or_file
```

### 3. Direct Update & Self-Improvement in `~/brain`

Edit `~/brain/projects/<project>.md` or `~/brain/knowledge/<topic>.md` directly (no `chezmoi apply` needed):

1. **Project Context Sync (`~/brain/projects/<project>.md`)**:
   * Update module lists, features, middleware, Makefile targets, DesignSystem components, or Core Invariants.
   * If adding a new project, register it in `~/brain/projects/README.md`.
2. **Autonomous Knowledge Distillation (`~/brain/knowledge/<topic>.md`)**:
   * Whenever you solve a non-trivial root-cause bug, verify an undocumented platform/compiler/framework quirk, or receive an architectural/design correction from the user, immediately distill the verified fact into `~/brain/knowledge/<topic>.md` (and register new topics in `~/brain/knowledge/README.md`).
   * Keep entries compact, high-signal, and strictly factual.

### 4. Validate & Auto-Commit to `~/brain`

1. Re-run the drift detector to confirm zero remaining discrepancies:
   ```bash
   ai-outline --check-doc /path/to/project
   ```
2. Commit the updated knowledge directly inside the `~/brain` repository:
   ```bash
   git -C ~/brain add projects knowledge && git -C ~/brain commit -m "docs(brain): sync <scope>"
   ```
