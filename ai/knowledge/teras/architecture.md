# Architecture — Teras

## 2026-09-05 — Familiar API Surface (define* combinators) LANDED

New consumer-facing layer on top of the existing 6-layer engine (engine semantics unchanged):

- **New package `@teras/runtime`** (`packages/runtime`): `defineView` / `defineShell` / `defineTick` / `defineAction` / `defineFormat` combinators (identity fallbacks + branded token types), `createApp` re-export, ambient `item` declaration.
- **Authoring model**: one `app.teras.tsx` file = whole app; shell + component views + worker ticks/actions + main-thread formatters as `define*` call sites; kind tokens are view const VALUES (no string actions); normal ESM imports for splitting.
- **`@teras/unplugin` pipeline**: AST-resolves define* call sites → compiles JSX via @teras/compiler (knownComponents/actionIds) → splits each module into `virtual:teras/view:<path>` (descriptor+formatters, main thread) and `virtual:teras/system:<path>` (tick/action fns, worker) → aggregates `virtual:teras/worker` (WorkerSystem bootstrap: registerComponentKind/Tick/Action, startLoop(60)) and `virtual:teras/app` (TerasAppGraph + createWorker).
- **`@teras/dom`**: `createApp(graph, options)` absorbs memory creation (layout DERIVED from field tables), worker attach, shell instantiation, `<!--teras-slot:<kind>-->` comment → container expansion, per-kind instantiator/lifecycle/delegator wiring, formatter pass (patch + customUpdater now BOTH run; formatter first, onApplyBindings after). renderPass kind-filters instantiators (`kindId` bound).
- **`@teras/core`**: new `kind: Uint8Array` column (component kind id, 1..255, 0 = KIND_UNASSIGNED) between `state` and `dirty`.
- **`@teras/worker`**: `ComponentRegistry` — monomorphic auto-dirty record accessors (one prototype per FieldTable, reused record view per kind), kind-scoped `KindCtx` (each/spawn/byId/destroy), kind-routed action dispatch, registration-ordered ticks.
- **Playground** is migrated: single `src/app.teras.tsx` + 3-line-ish `main.ts`; surface grep gate test in `playground/tests/surface.test.ts` bans engine vocabulary.

## 2026-09-01 Engine State (unchanged below)

### Layer Map

| Layer | Package | Responsibility |
|---|---|---|
| **Layer 1: Central Source of Truth** | `@teras/core` | `SharedArrayBuffer` Structure-of-Arrays (SoA) layout allocator, slot-based String Arena, atomic dirty bitmasks (`Atomics.or`, `Atomics.and`), inter-thread protocol definitions, and custom error types. |
| **Layer 2: Monomorphic Projection Compiler** | `@teras/compiler` | AOT TSX/JSX parser and compiler producing static HTML strings, deterministic child index paths (`path: number[]`), and branchless monomorphic dirty-check patch functions. |
| **Layer 3: Data Plane & System Dispatcher** | `@teras/worker` | Dedicated Web Worker background engine featuring O(1) free-list entity allocation, generational ABA safety, atomic state mutators, and 60Hz+ continuous simulation loop. |
| **Layer 4: DOM Projection Engine** | `@teras/dom` | Main thread rendering orchestrator executing the Clear-then-Read rAF sync loop, zero-closure global event delegator with direct SAB `encodeInto` fast-path, and Two-Step Deletion Handshake coordinator. |
| **Layer 5: Build & Security Plugin** | `@teras/unplugin` | Vite plugin enforcing mandatory COOP/COEP isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) and compiling `.teras.tsx` files. |
| **Layer 6: Application Consumer** | `playground` | End-to-end telemetry (10,000 entities @ 60 FPS) and TodoMVC benchmark demonstration app. |

---

### Core Principles & Architecture Patterns

```
+-------------------------------------------------------------------------+
|                              Worker Thread                              |
|   +-----------------------------------------------------------------+   |
|   |  WorkerSystem & Simulation Loop (60Hz+)                        |   |
|   |  - EntityPool: O(1) Free-List Stack + Generational ABA Guard   |   |
|   |  - State Mutators: Numbers Float64Array + String Arena          |   |
|   |  - Atomics.or(dirty, id, MASK): Atomic Dirty Bitflag Set       |   |
|   +-----------------------------------------------------------------+   |
+------------------------------------+------------------------------------+
                                     |
                       SharedArrayBuffer (SoA Layout)
    [state (u8) | dirty (i32) | generation (u16) | numbers (f64) | strings (u8)]
                                     |
+------------------------------------+------------------------------------+
|                               Main Thread                               |
|   +-----------------------------------------------------------------+   |
|   |  rAF Render Loop (Clear-then-Read Sync)                         |   |
|   |  - Atomics.and(dirty, id, ~0): Clear dirty bitmask & read old   |   |
|   |  - Monomorphic DOM Patch: Branchless direct pointer updates     |   |
|   |  - Two-Step Deletion Handshake: Unmount DOM -> RELEASE_SLOT    |   |
|   |  - Zero-Closure EventDelegator: encodeInto fast-path to SAB     |   |
|   +-----------------------------------------------------------------+   |
+-------------------------------------------------------------------------+
```

1. **Structure-of-Arrays (SoA) Shared Memory Layout**:
   - Instead of allocating individual JavaScript objects on the heap, all entity state is packed into contiguous typed arrays within a pre-allocated `SharedArrayBuffer`.
   - View alignment ensures zero unaligned access penalties: `dirty` (Int32, 4-byte aligned), `generation` (Uint16, 2-byte aligned), `numbers` (Float64, 8-byte aligned), `stringArena` (Uint8, 1-byte aligned).

2. **Clear-then-Read rAF Synchronization Loop**:
   - On each render frame, the main thread atomically clears the dirty bitmask using `Atomics.and(dirty, entityId, 0)` and inspects the bitmask that was present *before* clearing.
   - If the worker mutates an entity concurrently while the main thread is reading, the new dirty bit is guaranteed to persist into the subsequent frame without data loss or race conditions.

3. **Two-Step Deletion Handshake**:
   - Step 1 (Worker): Worker marks the entity `state = ENTITY_PENDING_DELETE` (2) and sets `DIRTY_DELETE` (0x10).
   - Step 2 (Main Thread): Main thread removes the DOM node from the tree, clears pointer references, and posts a lightweight `RELEASE_SLOT` message with the entity's generation counter.
   - Step 3 (Worker): Worker validates generation and recycles the slot index back onto the free-list stack.

4. **Generational ABA Safety**:
   - Every entity slot carries a 16-bit generational counter (`Uint16Array`), incremented on each allocation (`(gen % 65535) + 1`).
   - Action dispatch messages, slot release commands, and event payloads carry generational tokens. Stale events from destroyed entities are silently dropped in O(1) time.

5. **AOT Monomorphic Projection Compiler**:
   - Compiles `.teras.tsx` templates into static HTML strings and flat deterministic pointer arrays (`pointers[i]`).
   - Emits pure monomorphic JavaScript patch functions containing branchless bitwise dirty checks (`if (dirtyMask & 3) { ... }`) and direct element property assignments, eliminating virtual DOM diffing and closure overhead.
