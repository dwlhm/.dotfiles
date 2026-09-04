# Decisions — finan

Project ADRs live in-repo at `docs/adr/`. Summary of active decisions:

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
