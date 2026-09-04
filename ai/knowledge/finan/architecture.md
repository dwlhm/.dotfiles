# Architecture — finan

## 2026-09-05 Current State
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
