# Gotchas — Odin Ecosystem

General technical gotchas, traps, and workarounds for Odin systems programming (memory arenas, dynamic arrays, C ABI, SIMD, package imports, Raylib).

---

## [odin-01] 2026-08-28 Raylib Font Rendering & Unicode Glyphs [Status: Verified] [Agent: manual]
**Symptom**: Raylib fails to render Unicode symbols (`⌘`, `⚡`, `↵`, `✦`) or text looks blocky and unscaled.
**Cause**: Raylib's `GetFontDefault()` is a 10px ASCII bitmap font that cannot render Unicode codepoints above 127.
**Workaround**: Load TrueType fonts (e.g. `/System/Library/Fonts/SFNS.ttf` or `/System/Library/Fonts/Geneva.ttf`) via `raylib.LoadFontEx` with explicit Unicode codepoint slices and bilinear texture filtering.
**Anchors**: `raylib.LoadFontEx`, `raylib.GetFontDefault()`.

## [odin-02] 2026-08-28 Odin Linker Flags & Raylib Color Casting on macOS [Status: Verified] [Agent: manual]
**Symptom**: Linker failure (`Undefined symbols for architecture arm64`) when packages import Cocoa/Carbon/OpenGL native bridges, or type mismatch on Color arrays.
**Cause**: Odin requires explicit system framework flags when compiling C bridge objects; `raylib.Color` is a distinct `[4]u8` fixed array rather than a slice.
**Workaround**: Supply `-extra-linker-flags:"-framework Cocoa -framework Carbon -framework OpenGL bin/macos_bridge.o"` when building; cast byte arrays directly via `raylib.Color(b)`.
**Anchors**: `odin build -extra-linker-flags`, `raylib.Color`.

## [odin-03] 2026-09-08 Arena Allocator Lifetime & Scratch Reset Clashing [Status: Verified] [Agent: manual]
**Symptom**: Memory corruption, garbage strings, or segmentation faults when returning pointers or dynamic arrays from functions.
**Cause**: Allocating data inside `context.temp_allocator` and returning the pointer to the caller without deep-copying causes the data to be overwritten on the next `free_all(temp_arena)`.
**Workaround**: Use explicit allocator parameters (`allocator := context.allocator`) for all functions returning allocated data. If working with temporary data that must escape, call `strings.clone(s, allocator)` or copy slices before the arena resets.
**Anchors**: `context.temp_allocator`, `mem.Arena`.
