# Architectural Decision Records (ADR) — Teras

## ADR-001: Contiguous SharedArrayBuffer Structure-of-Arrays (SoA) Layout

### Context
Traditional component-based frameworks (React, Vue, Svelte) allocate millions of small JavaScript object allocations on the V8 heap during high-throughput workloads, causing Garbage Collection (GC) pauses, cache misses, and frame stutter.

### Decision
Store all application state in a single contiguous `SharedArrayBuffer` using a Structure-of-Arrays (SoA) layout with typed views (`Uint8Array` for state, `Int32Array` for atomic dirty flags, `Uint16Array` for generational counters, `Float64Array` for numbers, `Uint16Array` for string lengths, and `Uint8Array` for string byte arenas).

### Consequences
- **Positive**: Zero GC pressure during runtime mutations; cache-friendly contiguous memory; instant inter-thread sharing without serialization overhead.
- **Negative**: Memory size must be pre-allocated or bounded by `maxEntities`; string lengths are bounded per slot.

---

## ADR-002: Atomics Clear-then-Read Sync Protocol

### Context
Thread synchronization between Worker mutations and DOM render passes requires synchronization without locking or blocking either thread.

### Decision
Implement the **Clear-then-Read** atomic pattern: Main thread executes `Atomics.and(dirty, entityId, 0)` at the beginning of each frame pass. It inspects the dirty flags present *before* the clear and reads the corresponding memory slots.

### Consequences
- **Positive**: Lock-free, non-blocking; any concurrent write during a frame render automatically flags the entity dirty for the next frame without tearing or lost updates.
- **Negative**: Render loop runs continuously or on requestAnimationFrame demand.

---

## ADR-003: Zero-Closure Event Delegation with Direct SAB Fast-Path

### Context
Attaching per-element event listeners (`onClick={...}`) creates thousands of closures and event listeners in the DOM tree, slowing down garbage collection and memory usage.

### Decision
Attach a single root `EventDelegator` to the container DOM element. Elements declare actions via static `data-action` and `data-entity-id` HTML attributes. For text inputs, the delegator writes directly into the SharedArrayBuffer string arena via `TextEncoder.encodeInto` before posting the action.

### Consequences
- **Positive**: O(1) event listeners regardless of entity count; zero closure allocations per element; near-zero latency for user input.
- **Negative**: Events must bubble to the container element.

---

## ADR-004: AOT Monomorphic DOM Patch Functions

### Context
Virtual DOM tree diffing and interpretive binding loops add runtime overhead and prevent V8 JIT monomorphism.

### Decision
AOT compile `.teras.tsx` templates into deterministic absolute index binding paths (`path: number[]`) and emit monomorphic JavaScript patch functions with direct field-to-pointer dirty checks (`pointers[i]`).

### Consequences
- **Positive**: Monomorphic call sites in V8; direct property updates without VDOM diffing or dictionary lookups; maximum FPS throughput.
- **Negative**: Templates require build-step compilation via `@teras/unplugin`.
