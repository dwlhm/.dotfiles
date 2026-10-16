# SwiftUI & macOS Input

## Global hotkeys (Carbon API)

- Register: `RegisterEventHotKey` / unregister: `UnregisterEventHotKey`.
- Handler: `InstallEventHandler` + `GetEventDispatcherTarget`, event class `kEventClassKeyboard`, kind `kEventHotKeyPressed`.
- Read the pressed hotkey ID via `GetEventParameter` with `kEventParamDirectObject` / `typeEventHotKeyID`.
- Modifiers map to Carbon masks: `cmdKey`, `optionKey`, `controlKey`, `shiftKey`.
- Carbon is the reliable path for GLOBAL hotkeys; `NSEvent.addGlobalMonitorForEvents` observes but cannot consume/block events.

## Shortcut recording (capture from UI)

- `NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .flagsChanged])` returns the event; remove with `NSEvent.removeMonitor`.
- Convert `NSEvent.ModifierFlags` → Carbon masks for storage/registration.

## Testing

- Swift 6 packages use Swift Testing (`import Testing`, `@Suite`, `@Test`, `#expect`), not XCTest.
