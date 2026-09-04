# Architecture Decision Records (ADRs)

## ADR 1: Odin + Raylib + Objective-C Bridge
- **Decision**: Use Odin with Raylib for rendering and a lightweight Objective-C Cocoa runtime bridge (`bin/macos_bridge.o`).
- **Rationale**: Zero-GC, deterministic memory allocation, and native AppKit translucency (`NSVisualEffectView`) while maintaining sub-millisecond frame rendering.

## ADR 2: Damped Harmonic Oscillator (Spring Physics) for All UI Motions
- **Decision**: Replace linear easing curves with second-order damped harmonic oscillators.
- **Rationale**: Delivers industrial-grade fluid motion with natural momentum and settling across selection pill movement, window scale/alpha presentation, and focus glows.

## ADR 3: Native Swift Plugin Architecture (Superseded C ABI)
- **Decision**: Fully deprecate and remove legacy C ABI / `.dylib` loading in favor of native Swift `.titikplugin` bundles conforming to `TitikPlugin` / `TitikStreamingPlugin` protocols.
- **Rationale**: Removes unsafe raw memory copying, fragile C FFI boundaries, and dynamic library linking errors while providing type-safe streaming emitters, structured contexts, and native Swift async/await lifecycles.

## ADR 4: Swift 6 + SwiftUI/AppKit Modular Migration
- **Decision**: Fully migrate the core and UI to a modular Swift 6 + SwiftUI/AppKit stack with Swift Package Manager (`Package.swift`).
- **Rationale**: Direct access to Apple native APIs (`NSPanel`, `NSVisualEffectView`, `NSPasteboard`, `NSWorkspace`, Carbon Event Manager), native high-DPI font rendering, declarative component-driven UI with fluid spring animations, strictly modular single-responsibility targets (`TitikCore`, `TitikKeymap`, `TitikParser`, `TitikUI`, `TitikPlatform`, `TitikPlugins`, `TitikSearch`), and native `XCTest` unit & E2E testing.

## ADR 5: Bang-Prefixed Space-Delimited Plugin Activation & Self-Defined Short-Bangs
- **Decision**: Plugins define their own `short_bang` metadata in their manifest triggers. Plugins activate via query text ONLY with a leading `!` followed by either the plugin name or its short-bang and a trailing space (`!name ` or `!short_bang `). Interactive list selection and Tab autocomplete automatically append a trailing space to immediately activate the plugin.
- **Rationale**: Prevents accidental query hijacking during generic text searches, unifies all command triggers under the standard bang namespace, and allows plugins to cleanly expose custom short-bang identifiers.

## ADR 6: Liquid Glass HUD Translucency & Adaptive Fallback Engine
- **Decision**: Calibrate Liquid Glass with `NSVisualEffectView(material: .underWindowBackground, blendingMode: .behindWindow)`, ~0.48 opacity dark tint, specular gradient rim lighting (`borderGlassGradient`), and inner top sheen (`innerSheenGradient`), backed by an automatic fallback to solid dark acrylic (`bgSolidFallback`) when tint opacity \(\ge 0.80\) or macOS *Reduce Transparency* is active.
- **Rationale**: Eliminates opaque muddy visuals caused by legacy `.hudWindow` and over-saturated tints while preserving text contrast and preventing wasted GPU rendering under non-transparent or accessibility conditions.

## ADR 7: Explicit Whitelist Plugin Management via config.json
- **Decision**: Plugin lifecycle is strictly configuration-driven (`PluginsConfig` in `config.json`). Only plugin reverse-DNS IDs explicitly mapped to `true` in `config.plugins` are loaded at startup or reindex. Bundles on disk without configuration are inert. The plugin system is managed through a first-party `PluginSystemPlugin` (`!plugin reload`).
- **Rationale**: Eliminates implicit/magic discovery risks, ensures deterministic startup loading, and provides atomic configuration updates via `ConfigLoader.save()` with explicit reindex triggers.

## ADR 8: Industrial-Grade macOS Loadable Bundle (.bundle) Architecture
- **Decision**: Standardize dynamic plugin packaging on Apple's Loadable Bundle format (`.bundle` / `.titikplugin` containing `Contents/Info.plist`, `Contents/MacOS/<binary>`, and `Contents/Resources/manifest.json`), deprecating raw `.dylib` dynamic libraries. Support emoji icons in manifests (`"icon": "🧘"`), `NSPrincipalClass` reflection from `Info.plist`, dual-directory discovery (`~/.config/titik/plugins/` and app `PlugIns/`), and code signature validity checking (`SecStaticCode`). Statically embed built-in plugins for instant launch while providing automated packaging scripts (`scripts/build_plugin_bundle.sh`, `scripts/build_zen_plugin.sh`) for external extensions.
- **Rationale**: Eliminates fragile raw dynamic library linking, aligns with standard macOS bundle conventions, enables resource and metadata encapsulation, supports code signing integrity verification, and isolates third-party extensions while keeping built-in essentials fast and deterministic.


## ADR 9: Dynamic Plugin Keycaps, Responsive Geometry & Focus Transfer
- **Decision**: Introduce `KeycapAction` and `footerKeycaps: [KeycapAction]?` alongside `onActivated()` on `PluginUIRepresentable`. Remove all hardcoded minimum dimensions (`minHeight: 440`, `minWidth: 580`) from plugin views, allowing `.frame(maxWidth: .infinity, maxHeight: .infinity)`. On plugin activation, `UIOrchestrator` transfers focus to the plugin view and clears search list items, while `FooterView` renders the plugin-declared dynamic keycaps rather than hardcoding global actions.
- **Rationale**: Prevents HUD layout breaking and clipping across different plugin view heights, eliminates duplicate stacked footers, prevents search bar focus from intercepting plugin keystrokes, and ensures list items never linger when a plugin UI is presented.

## ADR 10: Declarative Keymap Architecture & Host Search Refocus (⌘L)
- **Decision**: Deprecate and strictly forbid `handleKeyDown(event: NSEvent)` and manual event monitoring in plugins via custom SwiftLint rules (`no_manual_key_monitoring_in_plugins`, `no_manual_keydown_in_plugins`). Replace with declarative `PluginKeymapScope` in `TitikPluginKit`/`TitikUI` where plugins register key combinations with `@MainActor () -> Void` closures upfront. `UIOrchestrator` acts as the sole local event monitor, intercepting strictly `⌘L` to refocus the global search bar, triggering matched plugin keymaps, and passing all unregistered keys (including `Return` in multiline editors) directly to the active AppKit responder chain. Dynamic footers automatically derive keycaps from `keymapScope.keycaps`.
- **Rationale**: Prevents rogue keystroke interception and keylogger behavior in plugins by never delivering raw `NSEvent` objects, eliminates accidental Return hijacking during multiline note editing, enables seamless bidirectional keyboard navigation between search bar and plugin views, and unifies dynamic footers with actual keyboard bindings into a single source of truth.

## ADR 11: Formalized Trigger System, Delimiter-Bounded Parsing & PluginInvocation AST
- **Decision**: Centralize all input parsing, trigger resolution, and flag extraction inside `TitikParser` (`CommandParser`) and formalize `PluginInvocation` in `TitikPluginKit`. Plugins must register clean triggers without `!` (e.g. `["note", "n"]`, `["calc"]`, `["emoji", "e"]`), and `!` is strictly the platform command prefix delimiter in the HUD. Plugins must strictly listen to `PluginInvocation` (both `TitikCommandPlugin.executeCommand(invocation:context:)` and `TitikStreamingPlugin.onQuery(invocation:)`) and are forbidden from implementing bespoke string-splitters, ad-hoc tokenizers, or bang-stripping (analogous to `PluginKeymapScope` for keyboard events). The only exception is domain DSL evaluation (e.g. `CalculatorPlugin` math evaluator) performed strictly on `invocation.primaryValue`. The core parser implements delimiter-bounded segment parsing standardized on `--flag` and `-f`, capturing dynamic multi-word arguments without requiring quotes.
- **Rationale**: Eliminates fragile ad-hoc regexes, quote rigidity, and redundant tokenizers across plugins; cleanly decouples platform input syntax from plugin logic; and establishes a strongly-typed, consistent AST contract across all plugin interaction modes.


