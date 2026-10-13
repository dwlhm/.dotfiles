# Work in Progress — finan

## Active
- [ ] Final runtime verification of schema 14, encrypted backup recovery, open CSV, recurring occurrences, reminders, and privacy — ACTIVE; implementation and earlier checks passed, latest recovery-gate lifecycle/runtime results await parent verification — started 2026-09-09

## Recently Completed
- [x] CI/CD pipelines (GitHub Actions: CI on push/PR to main; Release on tag v*) and patch release v1.1.1 (versionCode 3) with GitHub Release — completed 2026-09-20
- [x] Buku Kas unified monthly summary and transaction detail list — completed 2026-09-11
- [x] Horizon projections with skip and UI clearance polish — completed 2026-09 (commit 7d9eaa1)
- [x] Quick Transaction + Shortcut home-screen widgets with undo support — completed 2026-09 (commit 67fd835)
- [x] Transaction detail dialog redesign + deletion workflow — completed 2026-09 (commit 2603499)
- [x] Date/time picker overhaul with segmented tabs and presets — completed 2026-09 (commit 68a3cfc)
- [x] Wallet overview enhancement + codebase documentation — completed 2026-09 (commit b9a29c8)
- [x] Transaction shortcuts and templates — completed 2026-09 (commit e4e6498)
- [x] DB migration to v12 (recurring schedule) — completed ≤ 2026-09

## In Progress
- [ ] Performance fix batch (8 task groups, 2026-09-20): widget off-main-thread (TG1), async startup via finan-init + latch (TG2), sticky-header caching (TG3), SQL aggregation parity (TG4), dashboard resume dedup via dataVersion broadcast (TG5), streaming backup encrypt (TG6), N+1 removals export/balance/upcoming (TG7), onDraw/logging/deferred-dashboard polish (TG8). Build + unit tests green; androidTest parity test added (SummaryAggregationParityAndroidTest) but NOT run on device/emulator. Commit pending user request.
