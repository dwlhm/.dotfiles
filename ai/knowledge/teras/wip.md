# Work In Progress (WIP) & Status — Teras

## 2026-09-05 Familiar API Surface — LANDED, browser-verified

The define* combinator surface is implemented across all layers and verified END-TO-END in real Chromium (Playwright, 16/16 checks): telemetry 1000 entities animating @60fps with formatters, shock market, entity-pool resize, pause freeze/resume (entity-owned PauseButton with cross-kind read), TodoMVC CRUD + batch + clear + filters, tab switching, zero console errors. 121/121 unit tests green; typecheck clean except 2 pre-existing compiler-test errors; production build + COOP/COEP verified.

Defects found & fixed during browser verification (all regression-tested):
1. main.ts HUD element queries ran before createApp mounted the shell → null refs; onFrame throw then killed the rAF loop permanently → loop now try/finally-schedules next frame.
2. Virtual `?worker` import dead in Vite dev (see gotcha #11) → dev middleware fix.
3. Chrome SAB `encodeInto`/`decode` rejections (see gotcha #10) → core scratch-buffer fix.
- [ ] **Known v1 gaps to revisit**: shell event dispatch carries no payload (payload-carrying controls use `appHandle.dispatch` escape hatch in main.ts); `FrameStats` lacks per-kind aggregates (todo-count reads via `appHandle.layout`); recycled-count HUD dropped (no stat); EDIT_TODO dblclick inert (delegator sends no payload); worker `startLoop` doc says deltaTimeMs but tick contract is seconds; kindId ordering on late-registered modules not retroactively fixed; formatters must be pure + file-local; per-kind column groups (heterogeneous entity kinds sharing one pool) still deferred; tab-switch/filter-button main.ts wiring is main-thread-only UI state.
- [ ] Roadmap (pre-existing): WebGL/WebGPU backend, WASM mutators, DevTools extension.

## 2026-09-01 Solidification Status

### Completed Core Solidification
- [x] **Layer 1 (`@teras/core`)**: Centralized combined dirty bitmasks (`DIRTY_TEXT_MASK`, `DIRTY_CHECK_MASK`, `DIRTY_VALUE_MASK`, `DIRTY_ATTR_MASK`), layout parameter validation (`maxEntities > 0`, non-negative numeric/string fields), and complete JSDoc coverage.
- [x] **Layer 2 (`@teras/compiler`)**: Purged hardcoded domain identifiers (`symbol`, `price`, `delta`, `volume`). Implemented generic slot and data-type inference supporting explicit `slotMap` options, array indexing syntax (`item.numbers[i]`, `item.strings[i]`), and monomorphic bitmask-driven patch generator.
- [x] **Layer 3 (`@teras/worker`)**: Complete JSDoc comments on `WorkerSystem`, robust handling of null/undefined actions, 16-bit generational wrap-around tests (`65535 -> 1`), and out-of-bounds entity deallocation guards.
- [x] **Layer 4 (`@teras/dom`)**: Standardized `RenderLoop` and interpretive fallback loop with centralized dirty masks, numeric text projection support, and comprehensive `TerasApp` lifecycle test suite.
- [x] **Layer 5 (`@teras/unplugin`)**: Added unit test coverage for COOP/COEP header injection on dev and preview servers and JSX template transformations.
- [x] **Layer 6 (`playground`)**: Cleanly layered application-level formatting over generic DOD runtime in `playground/src/main.ts` with custom telemetry card formatters (`$#.##`, `+/#.##%`, `Vol: #,###`).
- [x] **Layer 7 (Knowledge Base)**: Second brain knowledge base scaffolded under `~/.dotfiles/ai/knowledge/teras/` and registered in master index `~/.dotfiles/ai/knowledge/_index.md`.

---

### Future Roadmap
- [ ] WebGL / WebGPU canvas projection backend utilizing the same SharedArrayBuffer SoA layout.
- [ ] WebAssembly data mutator pipeline in Rust/Zig for ultra-dense physics or audio DSP simulations.
- [ ] DevTools extension for real-time visualization of SharedArrayBuffer memory slots, dirty bit activity, and thread latency.
