# Architecture — finan

## 2026-09-09 Current State: schema 14 and recovery boundaries

Paths below are relative to `app/src/main/java/com/dwlhm/finan/`. Final runtime verification remains ACTIVE in `wip.md`; this records implemented structure, not a completion claim.

Production:

```ts
FinanApplication.onCreate
  → AppServices.create
    → FinanDatabaseHelper [schema 14]
  → BackupService.recoverPendingPreferences
    → [replay failure] BackupRecoveryGate.requireRecovery
      → current/future Activity recovery cover
        → [retry] BackupService.recoverPendingPreferences
          → [success] MainActivity restart
BackupControls
  → BackupService.inspect [authenticate before parsing, current schema only, 32 MiB maximum]
    → Preview
      → [explicit replace] BackupService.restore
        → {financial tables + preference journal, one SQLite transaction}
          → preference replay
            → [commit failure] application recovery gate; database already committed
```

Evidence: `FinanApplication.onCreate() @ FinanApplication.java:12`; `AppServices.create(Context) @ ui/common/AppServices.java:119`; `FinanDatabaseHelper.DATABASE_VERSION @ data/db/FinanDatabaseHelper.java:27`; `BackupService.inspect(InputStream,char[]) @ service/backup/BackupService.java:96`; `BackupService.restore(Preview) @ service/backup/BackupService.java:117`; `BackupService.recoverPendingPreferences() @ service/backup/BackupService.java:170`; `BackupRecoveryGate.requireRecovery(Context) @ service/backup/BackupRecoveryGate.java:41`; `BackupControls @ ui/settings/BackupControls.java:26`.

- SQLite migration 14 adds `transaction_templates.due_month` and `scheduled_occurrences`, keyed by `(template_id, due_date)`; recorded/skipped dates are explicit. Evidence: `Migration014ScheduledOccurrences.migrate(SQLiteDatabase) @ data/migration/Migration014ScheduledOccurrences.java:8`.
- CSV remains open, unencrypted append import; it does not invoke encrypted full replacement. Evidence: `ImportService.importFrom(InputStream) @ service/export/ImportService.java:126`.
- Reminder consent and notification bookkeeping are device-only preferences, excluded from portable backup. Evidence: `ReminderPreferences @ data/prefs/ReminderPreferences.java:7`; backup preference allowlist at `service/backup/BackupService.java:32`.
- App lock protects UI/navigation and masks widgets, not local SQLite encryption; its background grace period is 60 seconds. Evidence: `AppLock.LOCK_TIMEOUT_MS @ service/privacy/AppLock.java:29`, `AppLock.afterUnlock(Activity,Runnable) @ service/privacy/AppLock.java:70`.

## 2026-09-05 Historical State
Capture-first financial tracker for Android (production v1). Pure **Java 17** + Android Views (XML, no Compose), SQLite with manual migrations, zero external frameworks (no DI, no ORM, no coroutines). Local-first writes; UI in Indonesian by default (`resConfigs en, id`).

### Layer Map
| Layer | Path | Responsibility |
|---|---|---|
| App entry | `app/src/main/java/com/dwlhm/finan/FinanApplication.java` | Service initialization, manual DI root |
| UI | `ui/<screen>/` (package-by-screen, ADR 003) | MainActivity (single activity + bottom nav), capture, dashboard, wallet, category, history, search, summary, export, settings, widget, transaction |
| Shared UI | `ui/components/`, `ui/common/` | Custom views (FinancialKeypadView, DonutChartView, FloatingBottomNavView), shared dialogs/bottom sheets |
| Service | `service/{transaction,wallet,summary,balance,category,transfer,export}` | Business logic; TransactionService, BalanceService, AdjustmentService, ExportService, ImportService, template/shortcut services |
| Data | `data/{dao,db,migration,entity,prefs}` | SQLite DAOs, `FinanDatabaseHelper`, `MigrationRunner` v1–v12, SharedPreferences (DefaultsStore, TransactionFormDraft) |
| Domain | `domain/{model,rule}` | Pure models (Transaction, Wallet, Category, MonthlySummary) + BalanceRules/ValidationRules |
| Util | `util/{date,money,math,search,ui}` | DateRange, MonthRange, PayrollCycleResolver, MoneyFormatter/Parser, FuzzySearch |
| Tests | `app/src/test/`, `app/src/androidTest/` | Unit tests; migration + DAO integration tests |

### Key Patterns
- **Capture-First**: main menu = Catat (capture) / Buku Kas (monthly dashboard) / Pengaturan (settings); capture screen must open < 50ms, no blocking DB on critical path.
- **Manual 4-tier architecture**: `ui → service → data → domain`, manual DI via `AppServices` (no Hilt/Dagger).
- **Manual migration runner**: `MigrationRunner` executes `Migration001`–`Migration012` (latest: `Migration012RecurringSchedule`); DB file `finan.db`, version 12.
- **Local-first writes**: transaction inserts commit to SQLite first, UI updates via callbacks/listeners.
- **Single Activity**: `MainActivity` hosts fragments; `SearchTransactionActivity` is the second activity; home-screen widgets (`QuickTransactionWidgetProvider`, `ShortcutWidgetProvider`) broadcast `ACTION_DATA_CHANGED` to refresh.
- **Floating Liquid Glass nav**: dual-layer custom view, auto hide/show via `HideBottomViewOnScrollBehavior`.

### Build
`JAVA_HOME="/Users/dwlhm/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug` (JDK 17 from Android Studio JBR). AGP 9.1.1, minSdk 30, targetSdk 35, compileSdk 37.
