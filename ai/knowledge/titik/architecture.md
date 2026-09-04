# Architecture: Titik Command Center

## 1. Overview
**Titik** (*"Dot / Point"*) is a native macOS Command Center built with **Swift 6**, **SwiftUI**, and **AppKit** under Swift Package Manager (SPM). It delivers sub-millisecond keyboard-first interactions, native macOS **Liquid Glass** HUD translucency (`NSVisualEffectView`), a clean modular architecture, dynamic C ABI plugin capabilities, zero-allocation fuzzy searching, query-to-command AST parsing, and robust Unit/E2E test suites.

## 2. Layer Boundaries & Component Layout
- **`TitikCore`**: Coordinates system services and foundation models: `ClipboardManager` (`NSPasteboard` watcher & history), `SystemCommands` (10 native macOS actions), `AppLauncher` (`/Applications` indexer, running process tracker & launcher), `FileBrowser` (tilde-expanded directory navigator, media type classifier & scoped file searcher), `ConfigLoader` (`~/.config/titik/config.json`), `FuzzyMatcher`, and `Logger` (subsystem-tagged structured logger).
- **`TitikKeymap`**: Virtual keycode mapping (`Keycode`), modifier bitmasks (`KeyModifier`), collision-preventing `KeymapRegistry`, and Carbon global hotkey listener (`HotkeyManager`).
- **`TitikParser`**: Pure query-to-AST parser (`CommandLexer`, `CommandParser`, `CommandAST`) treating user inputs as structured commands.
- **`TitikUI`**: Pure design system tokens (`Theme`), pastel category palette (`.application`, `.systemCommand`, `.clipboard`, `.calculator`, `.plugin`, `.custom`, `.file`, `.directory`), `VisualEffectView` HUD container, `KeycapView`, `SearchBarView`, `ResultsListView`, `PreviewPaneView` (rich preview renderer for images, PDFs, video, audio, code/text, directories), `FooterView`, and `PluginUIRepresentable` protocols.
- **`TitikPlatform`**: Native macOS platform orchestrator (`WindowController`) managing the floating borderless `NSPanel`, 58% golden ratio screen centering, focus handling, dynamic preview pane collapse/expand, and UI composition (`UIOrchestrator`).
- **`TitikPlugins`**: Native Swift plugin manager (`PluginManager`) and dynamic bundle loader (`PluginHost`) loading `.titikplugin` bundles, managing whitelist registrations (`PluginsConfig`), handling reindexing, and providing the first-party `PluginSystemPlugin` (`!plugin reload`).
- **`TitikSearch`**: Multi-provider search aggregator (`SearchEngine`), boundary-aware `FuzzyMatcher` (FZF scoring algorithm), and AST `MathEvaluator`.
- **`Titik`**: Application entrypoint (`main.swift`, `AppDelegate.swift`) configured with `LSUIElement` accessory app policy.

