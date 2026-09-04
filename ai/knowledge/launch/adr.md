# Decisions — VelocityLauncher

## 2026-08-22 Jetpack Compose Material 3 with Legacy View Interop for AppWidgets

**Context**: Building a modern Android launcher requires a performant, reactive UI toolkit capable of smooth continuous physics animations, declarative state updates, and dynamic theming, while remaining fully compatible with Android's legacy View/RemoteViews-based AppWidget framework.
**Decision**: Adopt Jetpack Compose (BOM 2024.06.00, Material 3) as the foundational UI architecture, encapsulating native `AppWidgetHostView` instances via `AndroidView` interop wrapped in a custom `ScrollAwareAppWidgetHost`.
**Rationale**: Compose dramatically reduces UI code complexity and state synchronization bugs compared to legacy XML Views and fragments. Since Android's widget system relies exclusively on `RemoteViews` and `AppWidgetHostView`, hybrid interop with custom touch event arbitration provides modern development velocity without sacrificing widget ecosystem compatibility.
**Consequences**: Touch event arbitration must be explicitly handled via `requestDisallowInterceptTouchEvent` in `ScrollAwareAppWidgetHostView` to avoid conflict with Compose scroll containers.

## 2026-08-22 Data-Oriented Design (DOD) with Flat Primitive Buffers for Wave Alphabet Scrollbar

**Context**: The curved alphabet scrollbar evaluates continuous Gaussian bell-curve displacement, font scaling, and dynamic alpha at 60/120 FPS during thumb scrubbing. Traditional object-oriented allocations inside the draw loop trigger frequent garbage collection stutters.
**Decision**: Implement a Data-Oriented Design (DOD) memory structure via `WaveRenderBuffer` using preallocated primitive `FloatArray` and `BooleanArray` fields, paired with pre-calculated `TextLayoutResult` glyphs in `WaveAlphabetLayoutCache`.
**Rationale**: Primitive flat arrays eliminate heap object allocations completely during drag and draw passes, ensuring stutter-free 120Hz gesture response on high-refresh-rate Android displays.
**Consequences**: Rendering logic operates on array indices and primitive floats rather than higher-level domain objects, requiring indexed state updates.

## 2026-08-22 Decoupled Pure Mathematical Physics Engines for Headless Unit Testing

**Context**: Gesture math, trigonometric coordinate transforms, start angle interpolation, and angular hysteresis calculations for the wave scrollbar and radial breakout wheel were initially tightly coupled with Compose layout state.
**Decision**: Decouple and isolate all mathematical simulations into pure Kotlin singletons (`RadialPhysicsEngine` and `WavePhysicsEngine`) that take primitive floats/integers and return pure offsets or indices without Android UI framework dependencies.
**Rationale**: Pure Kotlin simulation engines can be 100% verified via lightning-fast JVM unit tests without needing Robolectric or Android emulator instrumentation, and provide clean modular separation of concerns.
**Consequences**: Compose gesture handlers must translate raw touch coordinates into ratios/offsets and feed them into the math engine.

## 2026-08-22 Multi-Tiered Fuzzy Scoring and Frequency-Based Search Ranking

**Context**: Users rely on launcher search as a primary app navigation mechanism, requiring instant matches across exact labels, prefixes, word boundaries, camelCase initialisms, acronyms, and package names, along with automated prioritization of frequently used apps.
**Decision**: Implement a tiered scoring algorithm in `AppRepository.filterAndRankApps` combining exact label match (2000), prefix match (1500), word-boundary prefix (1000), initialisms/acronyms (800), substring match (500), fuzzy subsequence match (300), and package match (100), combined with persistent launch frequency weights (+40 per launch) and launcher settings keyword alias mapping.
**Rationale**: Provides immediate, intuitive results that match user muscle memory and cognitive shortcuts while automatically adapting to individual usage patterns over time.
**Consequences**: Search ranking requires persisting launch frequencies in `PreferencesManager` and tokenizing app labels upon loading.

## 2026-08-22 Dual-Mode Wallpaper and Solid Theming with Two-Pass Downsampling

**Context**: Users demand both minimal OLED black/charcoal solid backgrounds and vibrant dynamic theming extracted from system or custom wallpapers. Selecting high-resolution images can easily cause out-of-memory errors on lower-tier Android devices.
**Decision**: Support both `WALLPAPER` and `SOLID` background modes with custom palette presets (`AMOLED_BLACK`, `DEEP_CHARCOAL`, `MIDNIGHT_SLATE`, `CLEAN_LIGHT`, `CUSTOM`) and dynamic AndroidX `Palette` extraction using a two-pass decode downsampling pipeline (`MAX_WALLPAPER_DIMENSION = 1920`, `MAX_PALETTE_SAMPLE_DIMENSION = 200`).
**Rationale**: Guarantees zero OOM crashes while offering comprehensive theming flexibility from pure OLED battery-saving setups to rich Material 3 dynamic color harmonies.
**Consequences**: Window flags (`FLAG_SHOW_WALLPAPER`) and background alpha blending must be synchronized between `MainActivity` and `PreferencesManager`.
