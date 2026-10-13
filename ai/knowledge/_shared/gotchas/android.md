# Gotchas — Android Ecosystem

General technical gotchas, traps, and workarounds for Android development (Jetpack Compose, AppWidgets, Android SQLite, Java 17).

---

## [and-01] 2026-08-22 Jetpack Compose Recomposition Loop on Unstable Collections [Status: Verified] [Agent: manual]
**Symptom**: Uncontrolled recompositions on idle screens, high CPU usage, and UI micro-stutters during scrolling.
**Cause**: Standard Kotlin collections (`List<T>`, `Set<T>`, `Map<K, V>`) are treated as unstable by the Compose compiler because they are interfaces and cannot guarantee runtime immutability.
**Workaround**: Annotate UI state data classes with `@Immutable` or `@Stable`, or adopt Kotlinx Collections Immutable (`ImmutableList<T>`). Wrap lambda closures in `remember { ... }` to preserve reference identity across recompositions.
**Anchors**: `@Immutable`, `@Stable`, `androidx.compose.runtime`.

## [and-02] 2026-08-23 AppWidget RemoteViews View Class Whitelist [Status: Verified] [Agent: manual]
**Symptom**: Runtime crash `android.view.InflateException: Class not allowed to be inflated` when binding AppWidget layout.
**Cause**: `RemoteViews` executes in the System UI process and strictly whitelists supported layouts (`FrameLayout`, `LinearLayout`, `RelativeLayout`, `GridLayout`) and views (`TextView`, `ImageView`, `ProgressBar`, `Button`, `ListView`, `GridView`, `StackView`, `ViewFlipper`). Custom views, `ConstraintLayout`, or Jetpack Compose (without Glance) fail immediately.
**Workaround**: Structure widget layouts strictly with whitelisted Android view groups, or use Jetpack Glance for modern Composable-to-RemoteViews translation.
**Anchors**: `RemoteViews`, `AppWidgetProvider`.

## [and-03] 2026-09-05 SQLite Schema Migration Constraint Crashes [Status: Verified] [Agent: manual]
**Symptom**: App crash with `SQLiteConstraintException` on app update when applying incremental migrations (e.g. adding `NOT NULL` columns).
**Cause**: `ALTER TABLE ADD COLUMN` with a `NOT NULL` constraint requires a non-null default value in SQLite; otherwise the statement fails if existing rows exist.
**Workaround**: Always provide explicit `DEFAULT` values when adding non-null columns in manual SQLite migrations (`ALTER TABLE t ADD COLUMN c TEXT NOT NULL DEFAULT ''`). Test multi-step migrations from v1 to current version in hermetic automated test suites.
**Anchors**: `SQLiteOpenHelper.onUpgrade`, `SQLiteConstraintException`.
