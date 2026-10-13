# Gotchas — Titik

Project-specific gotchas, internal architectural traps, and closed proprietary workflows for Titik.

---

## [ttk-01] 2026-08-30 Streaming AI Plugins vs Search Bar Real-Time Keystrokes [Status: Verified] [Agent: manual]
**Symptom**: Spammed network cancellations on every keystroke, polluted multi-turn chat history (`AISessionCoordinator`), and false `cancelled` errors.
**Cause**: In `UIOrchestrator`, search queries update `@Published query` on every keystroke. Dispatching remote network requests (e.g. LLM streaming endpoints) immediately inside `handleSearchQuery` spams the API server.
**Workaround**: Keep search keystrokes decoupled from AI network calls by holding `pendingQuery` in the adapter and executing `submitQuery()` only on explicit Return / Enter keypress, prompt chip selection, or follow-up submission. Log stream cancellations at `debug` level and handle gracefully.
**Files**: `UIOrchestrator.swift`, `AISessionCoordinator.swift`.

## [ttk-02] 2026-08-31 Plugin View & Bang Routing Architecture (No Search Interception) [Status: Verified] [Agent: manual]
**Symptom**: Streaming queries cannot reach plugins, or static command description stubs intercept typing.
**Cause**: `SearchEngine` synthesizing artificial static command description stubs (e.g. `List Shortcuts`) when typing `!<bang><space>` blocks the streaming query from reaching the plugin's stream (`pluginHost.query(...)`).
**Workaround**: Typing `!<bang><space>` (e.g. `!shortcut `, `!zen `, `!open `) must route directly to the corresponding plugin's stream. `SearchEngine` must never synthesize static command stubs that intercept or block the streaming query. The plugin dynamically produces and filters its items/canvas in `onQuery(...)`. In `UIOrchestrator.executeSelected()`, only genuine bang suggestions (`item.id.hasPrefix("bang:")`) autocomplete/fill the query bar; actionable plugin items must directly execute `item.action()`.
**Files**: `SearchEngine.swift`, `UIOrchestrator.swift`, `PluginHost.swift`.

## [ttk-03] 2026-09-01 SearchItem Action Closure Recursion & Async Task Fork Bomb [Status: Verified] [Agent: manual]
**Symptom**: Exponential asynchronous fork bomb (`Task` spawning `Task`) consuming 200%+ CPU, freezing test runners, and emitting hundreds of thousands of log lines.
**Cause**: When SearchItems are created for native plugins or built-ins (`titik.builtin.clipboard`, `titik.builtin.app`), their `action` closures blindly forward to a global dispatcher that falls back to re-searching the same query (`self.dispatch(query: payload)`), which returns the exact same item whose action calls the dispatcher again.
**Workaround**: Always handle built-in plugin IDs explicitly in the dispatcher and log unhandled plugins as a warning rather than recursively re-dispatching.
**Files**: `SearchItem.swift`, `CommandDispatcher.swift`.

## [ttk-04] 2026-09-08 Bang Item ID Grammar [Status: Verified] [Agent: manual]
**Symptom**: Autocomplete fails or corrupts search query when selecting compound bang command suggestions.
**Cause**: Bang SearchItem IDs are not always simple `bang:<trigger>`. Compound command suggestions use `bang:<manifest.id>:<cmd.id>:<trigger>` (e.g. in `BuiltinPluginsSearchProvider.swift`), and SearchEngine matches `bang:<prefix>:*`.
**Workaround**: Autocomplete-from-id must handle both simple and compound forms; compound IDs must fall back to payload-derived names rather than assuming a single-segment trigger.
**Files**: `BuiltinPluginsSearchProvider.swift`, `SearchEngine.swift`.

## [ttk-05] 2026-09-10 PluginCommandDispatcher Lives Only in the App Target [Status: Verified] [Agent: manual]
**Symptom**: SwiftPM test runner (`swift test`) fails to compile with undeclared types (`PluginCommandDispatcher`, `BuiltinServices`).
**Cause**: `Sources/Titik` is an Xcode-owned application target, not a SwiftPM library product. Tests referencing `PluginCommandDispatcher`, `BuiltinServices.install` app-composition, or pre-migration `LauncherViewModel()` default-arg initializers cannot compile under `swift test`.
**Workaround**: Decouple test dependencies using `LauncherServices` protocol ports or lift shared service contracts into a SwiftPM library target before referencing them in tests.
**Files**: `Package.swift`, `Sources/Titik/App/PluginCommandDispatcher.swift`.
