# Work-in-Progress

## Current (2026-09-27) — Post-migration review remediation
- Uncommitted WIP: Launcher Tab/ghost autocomplete feature (`LauncherKeyHandler.handleKeyEvent`, `LauncherViewModel.handleTabKey/autocompleteSelected`, `SearchBarView.isPluginActive` ghost suppression) + `Tests/TitikLauncherTests/LauncherTabAndGhostTests.swift`.
- Restored `TitikE2ETests` test target to `Package.swift` (orphaned since migration commit 172c19b — 21 files, was silently running 0 tests via `--filter TitikE2ETests`).
- Deduplicated `BangSuggestionHelper` → canonical copy in `Sources/TitikDomain/BangSuggestionHelper.swift`.
- `Theme.textPrimary/.primary`, `textSecondary = .secondaryLabelColor`, `textMuted/.secondary`; `.preferredColorScheme(.dark)` removed from LauncherRootView (dynamic light/dark).
- 8 E2E files excluded from build (rotten vs migrated APIs) — pending decision, see gotchas.
- Test totals: 324 tests / 47 suites green; swiftlint --strict + swift-format clean.
