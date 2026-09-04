# Gotchas — VelocityLauncher

## 2026-08-22 Scroll Conflict Between Android Widgets and Compose LazyColumn

**Symptom**: Scrolling or dragging inside scrollable AppWidgets (e.g. calendar agendas, email inboxes, tasks) causes the outer launcher `LazyColumn` to scroll unpredictably or drop gesture events.
**Cause**: Compose `LazyColumn` consumes unintercepted parent touch events unless child views explicitly call `requestDisallowInterceptTouchEvent(true)` on the hosting `ViewGroup`.
**Workaround**: `ScrollAwareAppWidgetHostView` intercepts touch events, recursively inspects child views (`RecyclerView`, `ScrollView`, `AbsListView`, `NestedScrollView`, `AdapterView`), and dynamically calls `parent.requestDisallowInterceptTouchEvent(true)` when touch slop is exceeded in the target scrolling direction.
**Files**: `app/src/main/java/com/velocity/launcher/ui/widget/ScrollAwareAppWidgetHost.kt`, `app/src/main/java/com/velocity/launcher/ui/compose/components/WidgetHostContainer.kt`

## 2026-08-22 High-Resolution Wallpaper Out-Of-Memory (OOM) Crashes

**Symptom**: Selecting large 4K/8K custom wallpapers causes memory spikes, UI lag, or fatal `OutOfMemoryError` exceptions during decoding and palette extraction.
**Cause**: Directly decoding raw image streams into full-resolution ARGB_8888 bitmaps exhausts available per-app heap memory on Android devices.
**Workaround**: `WallpaperColorExtractor.copyUriToInternalStorage` employs a two-pass decode strategy: reading image bounds via `inJustDecodeBounds = true`, computing power-of-two `inSampleSize` to bound max dimensions to `1920px`, saving a compressed JPEG copy to internal storage, and performing palette extraction on a dedicated max `200px` downsampled thumbnail.
**Files**: `app/src/main/java/com/velocity/launcher/data/WallpaperColorExtractor.kt`

## 2026-08-22 Garbage Collection Stutter During 120Hz Wave Scrollbar Scrubbing

**Symptom**: Micro-stutters and frame drops occur during rapid scrubbing along the curved alphabet scrollbar on high-refresh-rate displays.
**Cause**: Heap allocations inside 60/120 FPS gesture and draw callbacks trigger frequent Android Runtime (ART) garbage collection pauses.
**Workaround**: Applied Data-Oriented Design (DOD) principles via `WaveRenderBuffer` using preallocated primitive flat arrays (`FloatArray`, `BooleanArray`) and pre-measuring all font glyphs within `WaveAlphabetLayoutCache` so the render loop performs zero heap allocations.
**Files**: `app/src/main/java/com/velocity/launcher/ui/compose/components/WaveAlphabetScrollbar.kt`

## 2026-08-22 Physiological Tremor and Edge Clipping in Radial Quick Launch

**Symptom**: The radial quick launch wheel rapidly flickers between adjacent app items when holding a thumb still, or displays radial nodes cut off offscreen when triggered near screen top or bottom boundaries.
**Cause**: Fixed angle quadrant slicing lacks hysteresis tolerance against minor hand tremor, and fixed arc angles push outer nodes past the viewport bounds.
**Workaround**: `RadialPhysicsEngine` dynamically calculates `calculateBaseStartAngle` smoothly interpolating from 0° (top) down to -80° (bottom) based on vertical touch position ratio, and incorporates Schmitt-trigger angular hysteresis (`HYSTERESIS_SECTOR_RATIO = 0.18f`) plus direct Euclidean hit-testing proximity buffers.
**Files**: `app/src/main/java/com/velocity/launcher/ui/compose/components/RadialPhysicsEngine.kt`

## 2026-08-22 AppWidget Configuration Cancellation and Orphan Host IDs

**Symptom**: Canceling third-party widget setup leaves orphan widget IDs allocated in `AppWidgetHost`, causing corrupted state or blank widget containers.
**Cause**: Android requires explicit `allocateAppWidgetId()` before launching configuration intents, but requires calling `appWidgetHost.deleteAppWidgetId()` if configuration finishes with `RESULT_CANCELED`.
**Workaround**: `LauncherScreen` registers an `ActivityResultLauncher` that validates `RESULT_OK` before binding and persisting to `PreferencesManager`, and cleans up allocated IDs via `appWidgetHost.deleteAppWidgetId(pending.appWidgetId)` on cancellation.
**Files**: `app/src/main/java/com/velocity/launcher/ui/compose/LauncherScreen.kt`, `app/src/main/java/com/velocity/launcher/ui/compose/components/WidgetPickerDialog.kt`

## 2026-08-22 LauncherApps SecurityException on Work Profiles and Locked Users

**Symptom**: App crashes with `SecurityException` when querying app lists or dynamic shortcuts on devices with managed work profiles or locked secondary accounts.
**Cause**: Calling `LauncherApps.getShortcuts()` or `getActivityList()` on paused/locked work profiles throws runtime security exceptions.
**Workaround**: All `LauncherApps` and shortcut queries in `AppRepository` are wrapped in guarded try-catch blocks with graceful fallbacks (empty list / default icons), and profile queries gracefully fallback to `Process.myUserHandle()`.
**Files**: `app/src/main/java/com/velocity/launcher/data/AppRepository.kt`
