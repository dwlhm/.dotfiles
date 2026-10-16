# Dashd — Project Context

## Commands

- Build: `swift build`
- Run: `swift run Dashd`
- Test: `swift test` (Swift Testing, not XCTest)

## Architecture

- Entry: `Sources/Dashd/DashdApp.swift` — registers modules via `ModuleRegistry`.
- Modules: `Sources/Dashd/Modules/*` (conform to `UtilityModule`).
- Design system: `Sources/Dashd/UI/DesignSystem/*` — MUST be reused.
- Hotkey core: `Sources/Dashd/Core/Hotkey/*` (Carbon API — see `../knowledge/swiftui-macos.md`).

## UI conventions

- SwiftUI, macOS 14+, `.hiddenTitleBar` + `.unifiedCompact`.
- Tiered Progressive Disclosure (Tier 1–4).
- Reuse DesignSystem components; no ad-hoc styling.

## Hotkey rules

- Global registration = Carbon `RegisterEventHotKey` (not NSEvent global monitor).
- Recording = `NSEvent.addLocalMonitorForEvents`.
- Bare key without modifiers = critical conflict, reject.

## Definition of Done

- `swift build` && `swift test` green (show output).
- Input/hotkey features must be verified by running `swift run Dashd`, not just compiling.
