# Architecture — VelocityLauncher

## 2026-08-22 Current State

VelocityLauncher is a modern, ergonomic single-handed Android launcher built with Kotlin and Jetpack Compose (Material 3), featuring a curved wave alphabet scrollbar, radial quick launch wheel, multi-tiered search scoring, dynamic wallpaper/solid color theming, and touch-arbitrated Android AppWidget integration.

### Layer Map

| Layer | Path | Responsibility |
|---|---|---|
| Domain / Models | `app/src/main/java/com/velocity/launcher/data/AppModel.kt` | Immutable application data class with normalization, word prefix tokens, initialisms, and customization flags |
| Data / Repository | `app/src/main/java/com/velocity/launcher/data/AppRepository.kt` | Android `LauncherApps`, `UserManager`, and `ShortcutInfo` bridge with LRU icon/bitmap caches, launch routing, and search ranking |
| Battery Monitoring | `app/src/main/java/com/velocity/launcher/data/BatteryMonitor.kt` | Reactive battery level and charging state flow using `BroadcastReceiver` wrapped in `callbackFlow` |
| Persistence | `app/src/main/java/com/velocity/launcher/data/PreferencesManager.kt` | SharedPreferences storage for favorites, hidden apps, theme modes, scrollbar alignment, reachability spacing, and radial pins |
| Color / Palette Engine | `app/src/main/java/com/velocity/launcher/data/WallpaperColorExtractor.kt` | OOM-safe wallpaper downsampling, internal file storage, and AndroidX `Palette` color extraction |
| Presentation / State | `app/src/main/java/com/velocity/launcher/ui/compose/` | Single-source-of-truth MVI architecture: `LauncherViewModel`, `LauncherState`, and `LauncherScreen` |
| UI Components | `app/src/main/java/com/velocity/launcher/ui/compose/components/` | Modular composable components: `WaveAlphabetScrollbar`, `NiagaraHeader`, `NiagaraSearchSheet`, `NiagaraSettingsScreen`, `AppListItem`, `AppOptionsBottomSheet`, `AppShortcutsPopup`, `HiddenAppsScreen`, `QuickLaunchCustomizerSheet`, `WidgetPickerDialog`, and `WidgetHostContainer` |
| Physics & Math Engines | `app/src/main/java/com/velocity/launcher/ui/compose/components/` | Pure math modules: `RadialPhysicsEngine` (trigonometry, start angle interpolation, hysteresis) and `WavePhysicsEngine` (Gaussian decay wave physics) |
| Widget Subsystem | `app/src/main/java/com/velocity/launcher/ui/widget/` | `ScrollAwareAppWidgetHost` and `ScrollAwareAppWidgetHostView` handling touch event arbitration and nested scroll disallowance |
| Theme & Styling | `app/src/main/java/com/velocity/launcher/ui/theme/` | `Theme.kt` providing dynamic Material 3 color schemes, solid presets, adaptive tonal extraction, and surface colors |
| Platform Entry Points | `app/src/main/java/com/velocity/launcher/ui/` | `MainActivity` (singleTask launcher activity, wallpaper window flags, edge-to-edge system insets, back press dispatcher) and `SettingsActivity` |

### Key Patterns

- **MVI / Unidirectional Data Flow (UDF)**: `LauncherViewModel` exposes a unified immutable `StateFlow<LauncherState>`, while UI composables emit user intent callbacks back to the ViewModel without local state duplication.
- **Data-Oriented Design (DOD) for 120 FPS Rendering**: `WaveAlphabetScrollbar` utilizes preallocated contiguous primitive memory buffers (`WaveRenderBuffer` with `FloatArray` and `BooleanArray`) and pre-calculated `WaveAlphabetLayoutCache` to eliminate runtime garbage collection overhead during rapid touch scrubbing.
- **Decoupled Mathematical Simulation Engines**: `RadialPhysicsEngine` and `WavePhysicsEngine` encapsulate trigonometric formulas, Gaussian bell curves, coordinate transformations, and hysteresis buffers as pure Kotlin functions, enabling fast JVM unit testing without Android emulator dependencies.
- **Touch-Arbitrated Hybrid View-Compose Interop**: Android AppWidgets are hosted inside Compose `AndroidView` via `ScrollAwareAppWidgetHostView`, which recursively detects nested scrollable children (`RecyclerView`, `ScrollView`, `AbsListView`, `NestedScrollView`) and asserts `parent.requestDisallowInterceptTouchEvent(true)` to prevent gesture conflicts with the parent `LazyColumn`.
- **Multi-Tiered Fuzzy & Frequency Search Engine**: The search scoring algorithm evaluates exact match, prefix match, word-boundary match, camelCase/acronym initialisms, substring match, and fuzzy subsequence match, weighted by historical launch frequency learning (+40 per launch) and launcher settings alias keywords.
