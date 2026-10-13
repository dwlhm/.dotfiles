# Decisions — finan

Project ADRs live in-repo at `docs/adr/`. Summary of active decisions:

## 2026-09-11 Buku Kas unified summary and detail list
**Context**: The Buku Kas screen needed to show the monthly summary before its transaction detail without splitting the experience across tabs.
**Decision**: Compose one vertical `RecyclerView` with a single summary header adapter followed by the existing paged transaction adapter via `ConcatAdapter`.
**Rationale**: Summary-first ordering keeps the monthly context visible above the detail while avoiding redundant tabs and nested scrolling.
**Consequences**: The summary and paged transaction list share one scroll surface; transaction pagination remains owned by the existing transaction adapter.

## 2026-09-09 Portable backup and device-only security boundaries
**Context**: Complete recovery needs database records and recording preferences while CSV remains an interoperable exchange format.
**Decision**: Portable password-derived AES-GCM backup uses native JCA, authenticates before parsing, accepts only the current schema, and caps encrypted input at 32 MiB. Restore explicitly replaces financial tables atomically and journals the target preferences in the same transaction. CSV remains open and append-oriented.
**Rationale**: SQLite and SharedPreferences cannot share one transaction; retaining the journal allows idempotent replay after a crash or failed preference commit.
**Consequences**: `PREFERENCES_PENDING` means the database has committed, never rollback. An application-owned recovery cover survives Settings destruction and blocks continuation until replay succeeds. Consent, device authentication settings, and reminder bookkeeping remain local. App lock has a 60-second background grace period and protects UI only; it does not encrypt SQLite.
**References**: `BackupService.restore(Preview) @ app/src/main/java/com/dwlhm/finan/service/backup/BackupService.java:117`; `BackupRecoveryGate.requireRecovery(Context) @ app/src/main/java/com/dwlhm/finan/service/backup/BackupRecoveryGate.java:41`.

## 2026-08 ADR 003: Package by screen
**Context**: Flat `ui/` does not scale; capture screen has many UI concerns.
**Decision**: `ui/<screen>/` holds Activity, adapters, screen-local controllers; shared wiring via `AppServices`.
**Consequences**: Easy screen-specific navigation; wiring centralized in `ui/common/`.

## 2026-07 ADR 002: Export CSV v1
**Context**: Data portability requirement.
**Decision**: CSV export/import via SAF (Storage Access Framework), no cloud sync.
**Consequences**: User-controlled data; no backend dependency.

## 2026-07 ADR 001: minSdk 30
**Context**: Balance Play reach vs. modern APIs.
**Decision**: `minSdk = 30` (~83% cumulative coverage); `java.time` usable without desugaring.
**Consequences**: No Android 10 and below support.

## (inferred) Manual architecture, zero frameworks
**Context**: Capture critical path < 50ms and minimal APK size.
**Decision**: No DI framework, no ORM, no coroutines; manual `AppServices` wiring + raw `SQLiteOpenHelper` + explicit `MigrationRunner`.
**Consequences**: All wiring/migration is hand-maintained; discipline required to keep migrations sequential and pure.
