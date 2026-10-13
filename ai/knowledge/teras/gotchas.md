# Gotchas & Traps — Teras

## Critical Pitfalls & Solutions

### 1. SharedArrayBuffer COOP/COEP Isolation Requirement
- **Gotcha**: Modern browsers block `SharedArrayBuffer` by default unless cross-origin isolation headers are present on the host server response.
- **Trap**: Calling `new SharedArrayBuffer(...)` throws `ReferenceError: SharedArrayBuffer is not defined` or security errors.
- **Solution**: Always include `@teras/unplugin` in the Vite configuration or configure web servers to serve:
  ```http
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```

### 2. TypedArray Byte Alignment in SharedArrayBuffer
- **Gotcha**: Constructing TypedArray views (`Int32Array`, `Float64Array`, `Uint16Array`) at unaligned byte offsets throws a `RangeError: start offset must be a multiple of element size`.
- **Trap**: Allocating views back-to-back without padding bytes.
- **Solution**: `createSharedMemory` strictly uses the `alignTo(offset, alignment)` helper to guarantee 4-byte alignment for `Int32Array`, 2-byte alignment for `Uint16Array`, and 8-byte alignment for `Float64Array`.

### 3. UTF-8 Multi-Byte Splitting with `TextEncoder.encodeInto`
- **Gotcha**: Truncating a UTF-8 string by cutting bytes arbitrarily can split multi-byte characters (e.g. 4-byte emojis or CJK characters), causing invalid encoding corruption.
- **Trap**: Using raw buffer slices or byte counters without character boundary checks.
- **Solution**: Always encode via `TextEncoder.prototype.encodeInto(text, destinationSubarray)`. `encodeInto` is guaranteed by the Web standard to never emit partial multi-byte code units.

### 4. ABA Race Hazards and Stale Asynchronous Actions
- **Gotcha**: When an entity is deleted and its slot is immediately reused for a new entity, in-flight action messages dispatched by the UI for the old entity could mutate the new entity.
- **Trap**: Relying purely on entity slot index without generational tracking.
- **Solution**: Use the 16-bit generational counter on every entity slot. Worker and Main thread validate that `generation` matches the active entity before processing actions. Mismatched events are dropped silently.

### 5. Double Deletion and Free-List Corruption
- **Gotcha**: If an entity is freed multiple times or freed while pending unmount, the slot index is pushed onto the free-list stack multiple times, corrupting pool capacity.
- **Solution**: The `EntityPool.free` method guards against `ENTITY_INACTIVE` and generation mismatches before pushing onto `freeList`.

### 6. Vite Does Not Propagate User Plugins Into Worker Bundles
- **Gotcha**: `new Worker(url, { type: 'module' })` sub-bundles ignore the project's Vite plugin list; transforms/virtual modules the worker code needs silently fail at build.
- **Solution**: In `vite.config.ts`, set `worker.plugins` explicitly to include the same `@teras/unplugin` plugin instance.

### 7. Virtual Module Ids Re-entering the Transform Hook
- **Gotcha**: A virtual id that ends with a watched suffix (e.g. `virtual:teras/view:/…/app.teras.tsx` ends in `.teras.tsx`) gets fed back into the plugin's own `transform`, crashing the build.
- **Solution**: `transform` must early-return for the plugin's own `virtual:teras/*` ids; regression-tested in `packages/unplugin/tests`.

### 8. Numeric Class/Attr Bindings Must Not Decode the String Arena
- **Gotcha**: Projecting a numeric field into a `class`/`attr` binding by calling `decodeStringSlot(layout, id, slot)` treats the NUMERIC slot index as a STRING slot index → `RangeError` (numeric fields live in Float64 rows, not the arena).
- **Solution**: Numeric class/attr bindings read `layout.numbers[id * numNumericFields + slot]` and project `String(value)` — fixed in both the interpretive fallback (`dom/loop.ts`) and AOT patch (`compiler/codegen.ts`).

### 9. deltaTime Unit Mismatch (worker ticks)
- **Gotcha**: `WorkerSystem.tick()` contract is SECONDS (JSDoc + legacy tests), but the component-registry JSDoc says ticks receive `deltaTimeMs`.
- **Solution**: Treat `dt` as seconds today; true-ms semantics requires converting in `startLoop` — decide before relying on it (playground throttles via its own accumulator instead).

### 10. Chrome Rejects `encodeInto`/`decode` on SAB-Backed Views
- **Gotcha**: In Chrome, `TextEncoder.encodeInto(text, sabUint8Subarray)` and `TextDecoder.decode(sabUint8Subarray)` throw — Node tolerates shared-buffer views, so vitest passes while the real browser dies mid-frame (worker death after ~1 entity; silent in dev).
- **Solution**: In `@teras/core` `encodeStringSlot`/`decodeStringSlot`, encode/decode into cached NON-shared scratch buffers and copy via `set()`/byte copy. Regression-tested with Chrome's exact rejection semantics.

### 11. Virtual `?worker` Imports Are Dead in Vite Dev
- **Gotcha**: `import Worker from 'virtual:teras/worker?worker'` works in build but in dev Vite's `fileToDevUrl` maps the virtual id to `/@fs/virtual:teras/worker`, which hits the SPA HTML fallback; a module worker served HTML fails to parse SILENTLY (no console error) — worker never boots.
- **Solution**: `@teras/unplugin` `configureServer` middleware (registered AFTER the COOP/COEP header middleware, which must be FIRST) intercepts `/@fs/virtual:teras/*` and serves `server.transformRequest(virtualId)` output as `text/javascript`. COOP/COEP must also be set on the intercepted worker response or Chrome fails with `ERR_BLOCKED_BY_RESPONSE`.
