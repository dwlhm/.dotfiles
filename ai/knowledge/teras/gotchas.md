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
