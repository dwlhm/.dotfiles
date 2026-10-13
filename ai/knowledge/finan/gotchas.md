# Gotchas — finan

## 2026-09-20 Tag pushed with branch in one `git push` does not trigger tag workflows
**Symptom**: `git push origin main v1.1.1` created the tag on the remote but the Release workflow (`on: push: tags: ['v*']`) never started.
**Cause**: GitHub Actions tag-push event is unreliable when the tag arrives in the same push as the branch.
**Workaround**: Push the tag alone (delete remote tag, re-push it by itself). Release run then fires immediately.
**Files**: `.github/workflows/release.yml`.

## 2026-09-20 `org.gradle.java.home` in gradle.properties breaks CI
**Symptom**: GitHub Actions (ubuntu) build fails at daemon start.
**Cause**: `org.gradle.java.home` pointed to a macOS-only path (`/Users/dwlhm/Applications/Android Studio.app/...`).
**Workaround**: Removed the property; the daemon JVM is provisioned via `gradle/gradle-daemon-jvm.properties` (toolchain 21, JetBrains vendor, foojay resolver) and CI sets JDK 21 via `actions/setup-java`.
**Files**: `gradle.properties`, `gradle/gradle-daemon-jvm.properties`.

## 2026-09-20 Lint `MissingSuperCall` false positive on onBackPressed
**Symptom**: `./gradlew lint` fails on `MainActivity.onBackPressed` (line ~676) although `super.onBackPressed()` is called.
**Cause**: The override delegates to `navigateBack()`, which calls `super.onBackPressed()` at the terminal nav state; lint cannot trace cross-method delegation. Pre-existing code, only surfaced by CI's `lint` step (release packaging never ran full lint).
**Workaround**: `@SuppressLint("MissingSuperCall")` on the override. Proper long-term fix: migrate to `OnBackPressedDispatcher` callback.
**Files**: `onBackPressed @ app/src/main/java/com/dwlhm/finan/ui/MainActivity.java:677`; `navigateBack @ app/src/main/java/com/dwlhm/finan/ui/MainActivity.java:372`.

## 2026-09-20 Gradle release output uses `-unsigned` suffix
**Symptom**: `app/build/outputs/apk/release/` contains `app-release-unsigned.apk` and `app-release-unsigned.dm`, while the repo release convention (`app/release/`) uses `app-release.apk` / `app-release.dm` names.
**Cause**: `release` build type has no `signingConfig` in `app/build.gradle`; packaging steps must rename on copy.
**Workaround**: Copy with rename when packaging `app/release/`; update `versionCode`/`versionName` in `app/release/output-metadata.json`.
**Files**: `app/build.gradle:32-38`, `app/release/output-metadata.json`.

## 2026-09-09 Restored database can commit before preferences
**Symptom**: Backup restore reports pending preferences while restored database rows are already visible.
**Cause**: SharedPreferences commit follows the SQLite transaction; rollback language would be incorrect after that boundary.
**Workaround**: Retain every preference journal row until all preference commits succeed. Route `PREFERENCES_PENDING` from the worker to `BackupRecoveryGate`; a fragment callback can be stale or cancelled. Retry uses an application-owned Handler, and repeat failure keeps the cover active.
**Files**: `BackupService.restore(Preview) @ app/src/main/java/com/dwlhm/finan/service/backup/BackupService.java:117`; `BackupRecoveryGate @ app/src/main/java/com/dwlhm/finan/service/backup/BackupRecoveryGate.java:21`.

## 2026-09-09 Payroll cutoff backup validation includes a sentinel
**Symptom**: Valid last-business-day payroll preferences fail backup validation if cutoff is restricted to ordinary calendar days.
**Cause**: The application uses `-1` for the last business day; ordinary values are 1 through 31.
**Workaround**: Preserve and round-trip the sentinel; reject zero and out-of-range values. Backup tests cover both valid and invalid boundaries.
**Files**: `app/src/main/java/com/dwlhm/finan/service/backup/BackupService.java`; `app/src/androidTest/java/com/dwlhm/finan/service/backup/BackupServiceTest.java`.

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

## 2026-09-20 AppServices.create opens a second DB connection per call
**Symptom**: Widget receivers / any caller of `AppServices.create(context)` opens a NEW `FinanDatabaseHelper` + SQLite connection (plus WAL pragma) per event.
**Cause**: `AppServices.create` is a factory, not a singleton; the singleton lives in `FinanApplication` (async init) accessed via `ServicesProvider.get`.
**Workaround**: Always use `ServicesProvider.get(context)`; never call `AppServices.create` outside app init. Note `ServicesProvider.get` may block up to 10s on a latch while `finan-init` thread builds services on cold start.
**Files**: `app/src/main/java/com/dwlhm/finan/ui/common/AppServices.java`; `FinanApplication.java`; `ServicesProvider.java`.

## 2026-09-20 DbWorker.createAsync delivers callbacks on the MAIN thread
**Symptom**: Planning to latch-wait on main thread against a createAsync callback deadlocks cold start 100%.
**Cause**: `DbWorker.compute` posts UI callbacks via mainHandler; the success callback runs on the main looper, behind the currently-executing launch message.
**Workaround**: Startup init uses a dedicated daemon thread "finan-init" with a CountDownLatch counted down on the worker thread, NOT createAsync.
**Files**: `app/src/main/java/com/dwlhm/finan/FinanApplication.java`; `DbWorker.java:55-68`.

## 2026-09-20 AGP 8: buildConfig generation disabled by default
**Symptom**: `import com.dwlhm.finan.BuildConfig` fails to resolve.
**Cause**: `buildFeatures { buildConfig = true }` was absent from app/build.gradle (AGP 8 default = false).
**Workaround**: Enabled in app/build.gradle during TG4 (for BuildConfig.DEBUG logging guards).
**Files**: `app/build.gradle`.

## 2026-09-20 MonthlyDashboardCompositionAndroidTest is broken (pre-existing)
**Symptom**: `assembleDebugAndroidTest` fails with errors referencing nonexistent `R.id.weekly_detail_*` ids.
**Cause**: Test file stale vs current layouts; reproduces on a clean tree.
**Workaround**: Temporarily move the file aside to compile androidTest, then restore. Unfixed in source.
**Files**: `app/src/androidTest/java/com/dwlhm/finan/ui/dashboard/MonthlyDashboardCompositionAndroidTest.java`.

## 2026-09-20 Note search uses leading-wildcard LIKE (accepted trade-off)
**Symptom**: `note LIKE '%…%'` can't use an index → table scan per search reload.
**Cause**: Product requirement: substring search.
**Workaround**: Accepted — runs on dbWorker with 300 ms debounce. Do not "optimize" to prefix search without a product decision.
**Files**: `app/src/main/java/com/dwlhm/finan/data/dao/TransactionDao.java:418-433`.

## 2026-09-20 Widget undo countdown: duplicate expiry conditions made cleanup unreachable
**Symptom**: Widget stuck at "Batal (1s)" after save — save button never returns.
**Cause**: In `startUndoCountdownHandler`, gate `isPendingUndoActive` (WidgetStateStore.java:177-181, = `now < deadline`) is logically identical to the later `remaining > 0` check, so the else-branch (clearPendingUndo + final render) was unreachable on the final tick.
**Workaround**: Gate the tick on `txId > 0` instead, then branch on `remaining`; expired tick performs cleanup + final render.
**Files**: `app/src/main/java/com/dwlhm/finan/widget/QuickTransactionWidgetProvider.java:502-524`.
