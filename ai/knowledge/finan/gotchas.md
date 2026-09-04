# Gotchas — finan

## 2026-09-05 kotlin-stdlib duplicate classes
**Symptom**: Duplicate class build errors from `kotlin-stdlib-jdk7` / `kotlin-stdlib-jdk8`.
**Cause**: Transitive deps pull legacy Kotlin extensions even though this is a pure-Java project (Kotlin 1.8+ inlines them into kotlin-stdlib).
**Workaround**: Global exclusion in `app/build.gradle` — `configurations.configureEach { exclude group: "org.jetbrains.kotlin", module: ... }`.
**Files**: `app/build.gradle:7-10`

## 2026-09-05 Empty leftover package directories
**Symptom**: IDE shows `concurrent/`, `service/merchant/`, `service/tag/`, `service/shortcut/` packages with no files.
**Cause**: Migration008 removed tags/merchants; shortcut code lives elsewhere; empty dirs remain on disk.
**Workaround**: Ignore them; they contain zero source files. Don't add code there without intent.
**Files**: `app/src/main/java/com/dwlhm/finan/`

## 2026-09-05 docs/CODEBASE_INDEX.md is slightly stale
**Symptom**: Says minSdk 26, targetSdk 34, Java 8, DB version 11.
**Cause**: Not updated after minSdk bump (ADR 001), widget feature, and Migration012.
**Workaround**: Treat `build.gradle` + `MigrationRunner` as source of truth for versions; this knowledge base supersedes it.
**Files**: `docs/CODEBASE_INDEX.md`
