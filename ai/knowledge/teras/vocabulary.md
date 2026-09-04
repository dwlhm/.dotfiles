# Domain Vocabulary — Teras

## Core Concepts & Definitions

- **Entity Slot (`entityId`)**: An integer index `[0 .. maxEntities - 1]` representing a fixed slot in the contiguous SharedArrayBuffer Structure-of-Arrays (SoA) layout.
- **Generation Handle (`generation`, `handle`)**: A 16-bit monotonically increasing counter associated with each entity slot. Combined into a packed 32-bit integer `((generation << 16) | entityId)` to prevent ABA hazards and drop stale asynchronous events.
- **Dirty Bitmask**: A 32-bit atomic bitfield (`Int32Array`) modified via `Atomics.or` and `Atomics.and`. Represents which fields of an entity require DOM synchronization (`DIRTY_NEW`, `DIRTY_TEXT`, `DIRTY_CHECK`, `DIRTY_VALUE`, `DIRTY_DELETE`, `DIRTY_ATTR`).
- **Combined Dirty Masks**: Optimized composite bitmasks for fast bitwise checking (`DIRTY_TEXT_MASK = 3`, `DIRTY_CHECK_MASK = 5`, `DIRTY_VALUE_MASK = 9`, `DIRTY_ATTR_MASK = 33`).
- **Clear-then-Read**: An atomic concurrency primitive where the rendering thread atomically clears the dirty bitmask (`Atomics.and(dirty, id, 0)`) *before* reading component data arrays. Any concurrent mutation by the worker during the frame sets flags that are preserved for the subsequent frame.
- **Two-Step Deletion Handshake**: A protocol preventing race conditions during entity deallocation:
  1. Worker marks entity `state = ENTITY_PENDING_DELETE` (2) and sets `DIRTY_DELETE`.
  2. Main Thread unmounts the DOM node, clears cached element pointers, and posts a `RELEASE_SLOT` message with the entity's generation.
  3. Worker validates the generation and pushes the slot back onto the O(1) free-list stack.
- **String Arena**: A contiguous `Uint8Array` byte region partitioned into fixed-size string slots (`stringSlotSize`), accompanied by a `Uint16Array` view storing the exact byte length written for each string slot.
- **Absolute Child Path**: An integer array `[0, 1, 0]` describing the exact DOM hierarchy navigation path from a template root element to a dynamic target element.
- **Monomorphic Patch Function**: An AOT-generated JavaScript function with a fixed shape and stable property accesses, optimized for V8 inline caching and TurboFan JIT compilation.
