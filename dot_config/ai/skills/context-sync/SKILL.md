---
name: context-sync
description: >-
  Audits and synchronizes project context documentation in ~/.config/ai/projects/
  and platform knowledge in ~/.config/ai/knowledge/ against the live repository
  structure, Makefile/Package.swift targets, and DesignSystem symbols. Activate
  this skill when [STALE DOC] is reported by ai-outline, after adding/renaming
  modules or DesignSystem components, or when asked to check or update project docs.
---

# Context Sync Skill (`context-sync`)

Keep `~/.config/ai/projects/<project>.md` and `~/.config/ai/knowledge/` 100% accurate and synchronized with the actual repository state via `~/.dotfiles`.

## Steps

### 1. Run Live Drift Detection

Run the helper script against the target project repository:

```bash
ai-outline --check-doc /path/to/project
```

* If it outputs `[DOC OK]`, no structural drift was detected.
* If it outputs `[STALE DOC]`, inspect the exact `Missing in doc` or `Stale in doc` items listed in the output.

### 2. Inspect Live Symbols Without Full-File Reads

To inspect symbols and exact line ranges in any changed module or `DesignSystem` folder:

```bash
ai-outline /path/to/project/module_or_file
```

### 3. Update the Source of Truth in `~/.dotfiles`

Never edit `~/.config/ai/` directly without updating its source in `~/.dotfiles/dot_config/ai/`:

1. Edit `/Users/dwlhm/.dotfiles/dot_config/ai/projects/<project>.md` (or `/Users/dwlhm/.dotfiles/dot_config/ai/knowledge/<topic>.md`).
   * Keep entries compact, high-signal, and strictly factual (verified from build, test, or live source).
   * If adding a new project or knowledge file, also register it in `/Users/dwlhm/.dotfiles/dot_config/ai/projects/README.md` or `knowledge/README.md`.
2. Sync to `~/.config/ai/` using Chezmoi:
   ```bash
   chezmoi apply --no-tty --force
   ```

### 4. Validate Synchronization

Re-run the drift detector to confirm zero remaining discrepancies:

```bash
ai-outline --check-doc /path/to/project
```
