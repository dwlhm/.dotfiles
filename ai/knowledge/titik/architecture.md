# Architecture: Titik Command Center

## 1. Overview
**Titik** (*"Dot / Point"*) is a native macOS Command Center built with **Swift 6**, **SwiftUI**, and **AppKit** under Swift Package Manager (SPM). It delivers sub-millisecond keyboard-first interactions, native macOS **Liquid Glass** HUD rendering (`SwiftUI.glassEffect` on macOS 26+), a clean modular architecture, dynamic C ABI plugin capabilities, zero-allocation fuzzy searching, query-to-command AST parsing, and robust Unit/E2E test suites.

## 2. Layer Boundaries & Component Layout (current, post-migration)

Twelve SwiftPM library products (see `Package.swift`); `Titik` and `TitikWorker` executables are Xcode-owned schemes:

- **`TitikDomain`**: Foundation models, config domain types, `BangSuggestionHelper` (canonical).
- **`TitikContracts`**: Ports/abstractions (`BuiltinPorts`, `ShortcutPorts`, `FilePreviewDescriptor`).
- **`TitikParser`**: Pure query-to-AST parser (`CommandLexer`, `CommandParser`, `CommandAST`).
- **`TitikInfrastructure`**: System services — `ClipboardManager`, `AppLauncher`, `FileBrowser`, `ConfigLoader`, `ConfigShortcutStore`, `SystemCommands`, `WindowManager`, `Logger`, `EmojiCatalog`.
- **`TitikSearch`**: `SearchEngine` (multi-provider aggregator), FZF-style fuzzy matching, `MathEvaluator`.
- **`TitikDesignSystem`**: `Theme` tokens and native glass rendering, components (`KeycapView`, `TitikGlassCard`, `TitikFormField`, Toast).
- **`TitikPluginContracts`**: `TitikPlugin`, `PluginUIRepresentable`, `PluginKeymapScope` interfaces.
- **`TitikPluginUI`**: Plugin UI contracts (depends on TitikPluginContracts + TitikDesignSystem).
- **`TitikPluginRuntime`**: Plugin bundle hosting (`PluginHost`/`PluginManager`) and worker IPC.
- **`TitikBuiltins`**: Built-in plugins (App, Calculator, Clipboard, Emoji, FileBrowser, Launcher, Notes, PluginSystem, Shortcuts, SystemCommands, Window) + `BuiltinPluginsSearchProvider`.
- **`TitikLauncher`**: Launcher UI orchestration — `LauncherViewModel`, `LauncherKeyHandler`, `LauncherRootView`, `LauncherServices` (ports: `LauncherEffects`, `WindowManaging`, `ClipboardProviding`, `EmojiProviding`), `AutoPaster`.
- **`TitikPlatform`**: `WindowController` (floating `NSPanel`), `WindowSwitcherOverlayController`, `UIOrchestrator`.
- App composition (`Sources/Titik`): `AppCompositionRoot`, `PluginCommandDispatcher`, `BuiltinServices.install` — app-target only, not a library product.

Historical names (`TitikCore`, `TitikKeymap`, `TitikUI`, `TitikPlugins`, `ConfigWatcher`) are NOT current targets.

## 2026-10-03 Native Liquid Glass Contract

- **Result**: Launcher and switcher surfaces use Apple SwiftUI `glassEffect` on macOS 26+; the system owns the material rendering. Native effect clearance is reserved in window and content geometry.
- **Crack**: Older macOS versions and Reduce Transparency use an explicitly opaque surface. This is a fallback, not Liquid Glass.
- **Need**: Native API availability and the accessibility environment determine the branch. No `NSVisualEffectView`, blur/gradient/tint stacks, or manual shadows may emulate Liquid Glass.
- **Implementation anchors**: `NativeGlassModifier.body @ Sources/TitikDesignSystem/Theme.swift:160`; `HUDLayout @ Sources/TitikDesignSystem/Theme.swift:197`.
- **Source**: User correction on 2026-10-03; ADR 6; [Apple custom-view Liquid Glass API](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views).
