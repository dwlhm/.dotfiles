# Dashd — Project Context

## Commands

- Build: `swift build`
- Run: `swift run Dashd`
- Test: `swift test` (Swift Testing, not XCTest)

## Architecture

- Entry: `Sources/Dashd/DashdApp.swift` — registers modules via `ModuleRegistry`.
- Modules: `Sources/Dashd/Modules/*` (conform to `UtilityModule`).
  - `HotkeyManager/` (`HotkeyManagerModule`, `HotkeyStore`, `HotkeyDraft`)
  - `SystemActions/` (`SystemActionsModule`)
- Design system: `Sources/Dashd/UI/DesignSystem/*` (`Spacing`, `FlatComponents`, `ShortcutRecorder`, `ShortcutRecordingManager`, `AppPickerView`).
- Hotkey core: `Sources/Dashd/Core/Hotkey/*` (Carbon API — see `../knowledge/swiftui-macos.md`).

## Core invariants (never violate)

1. **Polymorphic module dispatch**: `RootView` renders modules strictly via `UtilityModule.makeContentView(currentTier:selectedItemName:)` and `ModuleRegistry.shared.currentModule` — never branch on `module.id` or duplicate `selectedModuleId` outside `ModuleRegistry`.
2. **DesignSystem reuse**: All shared surfaces (`FlatCard`, `FlatSearchField`, `FlatIconBadge`, `FlatCloseButton`, `FlatPaneDivider`, `FlatFeedbackBanner`, `FlatKeycapView`, `FlatConflictBadge`) live in `Sources/Dashd/UI/DesignSystem/` — never inline ad-hoc card/input/badge styles in feature views; promote any pattern used ≥2 times into `DesignSystem`.
3. **Encapsulated form state & metadata preservation**: Tier 3/4 editor state lives in `HotkeyDraft` (not scattered `@State` variables in the view), and updating an existing `HotkeyItem` must preserve `triggerCount`, `lastTriggeredAt`, and `createdAt`.
4. **Single source of truth for actions**: `HotkeyAction.SystemActionType` owns display metadata (`displayName`, `iconName`, `summary`); views iterate `SystemActionType.allCases` rather than duplicating command definitions.

## UI conventions

- SwiftUI, macOS 14+, `.hiddenTitleBar` + `.unifiedCompact`.
- Tiered Progressive Disclosure (Tier 1–4).
- Reuse `DesignSystem` components; no ad-hoc styling.

## Hotkey rules

- Global registration = Carbon `RegisterEventHotKey` (not NSEvent global monitor).
- Recording = `NSEvent.addLocalMonitorForEvents`.
- Bare key without modifiers = critical conflict, reject.

## Definition of Done

- `swift build` && `swift test` green (show output).
- Input/hotkey features must be verified by running `swift run Dashd`, not just compiling.
