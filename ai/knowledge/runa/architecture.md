# Architecture — runa

## 2026-09-20 Current State
Approved local Markdown direction: one SwiftUI window on macOS 26, one observable main-actor NotesStore, one MarkdownRepository actor. No database, cloud, accounts, packages, or metadata sidecars.

```ts
RunaApp → NotesWorkspaceView → NotesStore → MarkdownRepository → {Application Support/Runa/Notes/UUID.md}
  → AppLifecycleCoordinator → confirmDiscardOrSave → NotesStore.save / discardDraft
```

### Layer Map
| Layer | Path | Responsibility |
| --- | --- | --- |
| Composition/lifecycle | Runa/App | Single window; guard dirty close/quit |
| Feature | Runa/Features/Notes | List, search, editor, draft, visible retry/errors |
| Domain | Runa/Domain/Note.swift | UUID note identity; derived title; draft baseline |
| Persistence | Runa/Persistence/MarkdownRepository.swift | Canonical UTF-8 files, validation, atomic replacement |

### Key Patterns
- Draft baseline updates only after persistence succeeds; failure preserves edits.
- Source graph and verified path:line table: /Users/dwlhm/project/runa/docs/architecture.md.
- Test dependencies use temporary real directories with teardown, retaining production store/repository shape.
