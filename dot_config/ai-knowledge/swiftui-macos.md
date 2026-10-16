# SwiftUI & macOS Input (Dashd)

## Project facts

- Swift tools 6.4, macOS 14+, executable target `Dashd`.
- Tests use `swift-testing` (`@Suite`, `@Test`, `#expect`), not XCTest.
- Build: `swift build` · Run: `swift run Dashd` · Test: `swift test`.

## Layout

- `Sources/Dashd/UI/DesignSystem` — shared components (Spacing, FlatComponents, ShortcutRecorder, ShortcutRecordingManager, AppPickerView). New UI must reuse these; no ad-hoc styling.
- `Sources/Dashd/Core/Hotkey` — GlobalHotkeyEngine, KeyCombination, HotkeyItem, HotkeyAction, ConflictHarness.
- `Sources/Dashd/Modules/*` — feature modules (HotkeyManager, SystemActions).

## Global hotkeys (Carbon API, not NSEvent global monitors)

- Registration uses Carbon `RegisterEventHotKey` / `UnregisterEventHotKey` with `InstallEventHandler` + `GetEventDispatcherTarget` (see `GlobalHotkeyEngine.swift`).
- Engine signature OSType is `'DSHD'` (0x44534844); hotkey IDs start at 1 and increment.
- `KeyCombination` wraps keyCode + custom `ModifierFlags` (command/option/control/shift), converting NSEvent flags → Carbon masks (`cmdKey`, `optionKey`, `controlKey`, `shiftKey`).
- Bare keys without modifiers are rejected as critical conflicts (ConflictHarness).

## Shortcut recording (UI capture)

- Uses `NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .flagsChanged])` (see `ShortcutRecordingManager.swift`), removed via `NSEvent.removeMonitor`.
