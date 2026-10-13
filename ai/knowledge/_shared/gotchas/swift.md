# Gotchas — Swift Ecosystem

General technical gotchas, traps, and workarounds for Swift & SwiftUI development (Swift 6 concurrency, actors, SwiftUI structural identity, SPM, Swift Testing).

---

## [sw-01] 2026-08-28 SwiftUI Structural Identity & ScrollView State Retention [Status: Verified] [Agent: manual]
**Symptom**: Scroll position resets to top when switching between items with and without preview panes.
**Cause**: Placing `ScrollView` inside conditional `if/else` branches (`if hasRichPreview`) causes SwiftUI to assign different structural identities to the branches, destroying the `ScrollView` and resetting scroll position.
**Workaround**: Maintain a single persistent `ScrollView` in the view hierarchy and animate width dynamically (`geo.size.width * 0.55` vs `geo.size.width`) while conditionally showing/hiding sibling preview panes with `.asymmetric` transitions.
**Anchors**: `SwiftUI.ScrollView`, `.asymmetric` transition.

## [sw-02] 2026-08-28 SwiftUI List Row Jumping from Dynamic Text Font Weights [Status: Verified] [Agent: manual]
**Symptom**: Text bounding box and list row height dynamically shift and jump on keyboard selection changes.
**Cause**: Toggling font weights (e.g. `.semibold` when selected vs `.medium` when unselected) forces CoreText to re-measure glyph widths on every selection change.
**Workaround**: Keep row layout metrics (font weight, padding, height) 100% static across selection states and decouple the selection indicator into an independent background plate layer (`RoundedRectangle` fill + stroke modulated via `.opacity`).
**Anchors**: `SwiftUI.Text`, `CoreText`.

## [sw-03] 2026-08-29 SwiftUI High-Frequency Keyboard List Scrolling & Animation Queue Pileup [Status: Verified] [Agent: manual]
**Symptom**: Severe rubber-banding lag and micro-jitters during rapid keyboard navigation (30–60Hz key repeats).
**Cause**: Wrapping `proxy.scrollTo` in `withAnimation` during keyboard navigation spawns overlapping spring animations, overloading SwiftUI's render tree.
**Workaround**: Use explicit `Transaction().disablesAnimations = true` with `withTransaction` for zero-latency, 120fps intermediate list tracking, and decouple boundary rubber bouncing into a separate bounded offset layer triggered exclusively at top/bottom limits.
**Anchors**: `ScrollViewReader`, `Transaction.disablesAnimations`.

## [sw-04] 2026-08-29 Synchronous Media & Disk Decoding in SwiftUI View Rendering [Status: Verified] [Agent: manual]
**Symptom**: Perceptible UI hitches and frame drops during rapid list navigation.
**Cause**: Calling synchronous media extractors (e.g. `AVAssetImageGenerator.copyCGImage`, `PDFDocument.page.thumbnail`, or heavy `Data(contentsOf:)`) directly inside SwiftUI `body` blocks the `@MainActor` thread.
**Workaround**: Heavy previews must always be decoupled into background `.task(id: url)` jobs updating `@State` asynchronously while displaying lightweight skeleton placeholders.
**Anchors**: `@MainActor`, `.task(id:)`.

## [sw-05] 2026-08-30 Swift Protocol Witness vs Default Arguments [Status: Verified] [Agent: manual]
**Symptom**: Type conforms to protocol requirement `init(context:)` using `init(context:dependency:)` with a defaulted second argument, but fails to compile.
**Cause**: Swift does not match an `init(...)` protocol witness requirement to an initializer with defaulted parameters.
**Workaround**: Keep the designated initializer with all parameters and add a `public convenience init(context:)` that explicitly forwards to it.
**Anchors**: Swift protocol witness, `convenience init`.

## [sw-06] 2026-08-31 Synchronous Semaphore Blocking on @MainActor Keystrokes [Status: Verified] [Agent: manual]
**Symptom**: Search input freezes and drops frames on initial typing.
**Cause**: Invoking search or filter methods that block on `DispatchSemaphore.wait(timeout:)` directly from `@Published var query` freezes the `@MainActor` runloop.
**Workaround**: Decouple searches into cooperative asynchronous tasks using Swift Structured Concurrency (`withTaskGroup`), micro-debouncing (50ms), and checking `Task.isCancelled` at cancellation boundaries.
**Anchors**: `DispatchSemaphore.wait`, `withTaskGroup`.

## [sw-07] 2026-09-03 Test Synchronization vs Debounced ViewModel Queries [Status: Verified] [Agent: manual]
**Symptom**: Asynchronous ViewModel tests intermittently fail on CI runners due to timing race conditions.
**Cause**: Asserting state after fixed-duration sleeps (e.g. `Task.sleep(200_000_000)`) fails when virtualized CI runner CPU scheduling jitter exceeds the sleep window.
**Workaround**: Never use fixed sleeps to await debounced async state. Use a condition-driven poller (`waitUntil`) with a generous timeout (2.0s) and fast polling intervals (20ms) that completes as soon as expected state appears.
**Anchors**: `Task.sleep`, `waitUntil`.

## [sw-08] 2026-09-04 MainActor Deadlocks via Synchronous DispatchSemaphore in Action Closures [Status: Verified] [Agent: manual]
**Symptom**: App hangs deadlocked when executing action callbacks triggered from the UI.
**Cause**: In synchronous UI callback closures (e.g. `() -> Bool`), blocking with `DispatchSemaphore.wait(timeout:)` while waiting for an asynchronous `Task` that invokes `@MainActor` code causes priority inversion and deadlock.
**Workaround**: Check `Thread.isMainThread` in the synchronous closure. If on the main thread, dispatch `Task` asynchronously without blocking on a semaphore.
**Anchors**: `Thread.isMainThread`, `DispatchSemaphore.wait`.

## [sw-09] 2026-09-04 Hermetic Test Filesystem Paths vs Hardcoded User Paths [Status: Verified] [Agent: manual]
**Symptom**: Tests validating filesystem operations pass locally but fail in CI environments.
**Cause**: Tests hardcode developer machine home paths (e.g. `/Users/dwlhm/...`) which do not exist on CI runner environments (such as `/Users/runner/work/...`).
**Workaround**: Dynamically resolve paths using `FileManager.default.currentDirectoryPath` or ephemeral temporary folders (`FileManager.default.temporaryDirectory`) with cleanup routines.
**Anchors**: `FileManager.default.temporaryDirectory`, `FileManager.default.currentDirectoryPath`.

## [sw-10] 2026-09-05 Tautological Assertions & Non-Optional Comparisons in Swift Testing [Status: Verified] [Agent: manual]
**Symptom**: Test suite runs green while underlying data structures are broken or unverified; compiler warnings on nil checks.
**Cause**: Asserting `#expect(collection.count >= 0)` is tautological on collections and masks invariant violations. Comparing non-optional enums to `!= nil` emits warnings and verifies nothing.
**Workaround**: Test domain invariants directly (e.g. `bindings.count == Set(bindings.map(\.combination)).count`), pattern-match enum cases, and verify error or `nil` returns with dedicated test inputs.
**Anchors**: `Swift Testing`, `#expect`.

## [sw-11] 2026-09-06 Orphaned Test Directories After Package Migration [Status: Verified] [Agent: manual]
**Symptom**: `swift test --filter <Target>` exits green with ZERO tests matched after target or module migrations.
**Cause**: Test directories created under `Tests/` that are not declared as `testTarget` in `Package.swift` silently drop out of the build without compilation errors or test warnings.
**Workaround**: Diff `ls Tests/` against `grep testTarget Package.swift` after any migration, and assert test-count deltas in CI.
**Anchors**: `Package.swift`, `swift test`.
