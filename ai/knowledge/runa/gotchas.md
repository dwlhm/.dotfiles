# Gotchas — runa

## 2026-09-20 Signing and compiler plugin environment
**Symptom**: Xcode says hardened runtime is disabled for ad-hoc signing; restricted agent build can fail launching the Observation macro plugin.
**Cause**: Local project uses ad-hoc identity; agent sandbox can prevent compiler plugin subprocess sandbox setup.
**Workaround**: Open Runa.xcodeproj in Xcode for ordinary local Run. Agent verification uses approved execution escalation, never disabling macro sandbox. Distribution needs an appropriate Apple signing identity and notarization.
**Files**: Config/Base.xcconfig, README.md.

## 2026-09-20 External edit detection is best effort
**Symptom**: A draft save/delete can report a conflict after outside edits.
**Cause**: Repository compares current UTF-8 content with the draft baseline before writing/deleting. Comparison and mutation are separate operations.
**Workaround**: Preserve/copy the draft before Reload; do not claim cross-process transactions or locking.
**Files**: Runa/Persistence/MarkdownRepository.swift:85, Runa/Features/Notes/NotesStore.swift:68.
