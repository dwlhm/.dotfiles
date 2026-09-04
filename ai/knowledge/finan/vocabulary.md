# Vocabulary — finan

| Term | Definition | Code References |
|---|---|---|
| Catat | "Capture" screen — quick amount entry → category → instant save | `ui/capture/` |
| Buku Kas | "Monthly dashboard" screen — monthly overview + daily activities | `ui/dashboard/` |
| Pengaturan | "Settings" screen — wallets, categories, export/import | `ui/settings/` |
| Dompet | Wallet (Indonesian); multiple money sources (cash, bank, e-wallet) | `ui/wallet/`, `service/wallet/` |
| Capture-first | Core product philosophy: recording precedes analysis; zero-friction input | `docs/concept.md` |
| Critical path | Capture screen open time budget (< 50ms, no network/blocking DB) | `CaptureFragment`, `FinancialKeypadView` |
| AppServices | Manual DI container wiring services at app start | `FinanApplication`, `ui/common/` |
| MigrationRunner | Explicit sequential SQLite migration executor (no framework auto-migrate) | `data/migration/` |
| Payroll cycle | User-defined monthly cycle used for summaries (not calendar month) | `util/date/PayrollCycleResolver` |
