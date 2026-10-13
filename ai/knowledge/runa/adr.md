# Decisions — runa

## 2026-09-20 Local Markdown storage
**Context**: Native Swift/SwiftUI note-taking bootstrap, minimum macOS 26, runnable directly in Xcode.
**Decision**: User explicitly selected local Markdown files instead of the proposed SwiftData baseline. One canonical UUID-named UTF-8 file per note in sandbox-aware Application Support.
**Rationale**: Keep notes readable and independently backed up without a database or service.
**Consequences**: Titles derive from content; no sidecars; manual save. External modification detection compares baseline before atomic replacement but cannot guarantee cross-process compare-and-swap. Arbitrary folder selection and sync are outside current scope.
