# Terminal Grid and Renderer Architecture

## Project Overview
High-performance terminal emulator in Odin. The semantic state layer (grid,
damage tracking, scroll operations) produces damage journals for the GPU
renderer. The production main loop is paced by `APP_FRAME_INTERVAL_MS`, so
idle and continuous-output operation do not busy-spin. Production uses the
instance renderer; compute and fullscreen siblings remain benchmark/test
paths and are not initialized by `renderer_init`.

The renderer uses a frame transaction so surface acquisition, command
encoding, submission, presentation, and release have one ownership boundary.
Failed publication requeues the journal for a later frame. Normal frames do
not call the GPU idle barrier; barriers remain for resize, resource
replacement, and destruction.

## Current GPU Rendering Graph

```ts
main() @ src/app/main.odin:766
  -> app_frame(App*) @ src/app/main.odin:611
    -> renderer_frame(...) @ src/app/main.odin:708
      -> [no pending work] return
      -> [damage] renderer_prepare_frame(...)
        -> terminal_take_damage(...)
        -> surface_acquire
        -> shared_command_encoder
        -> encode Instance path + cursor
        -> boolean_submit
        -> present
        -> release
    -> time.sleep(APP_FRAME_INTERVAL_MS) @ src/app/main.odin:767
```

`pty_wait_readable(...) @ src/platform/pty/pty.odin:283` is a bounded POSIX
poll primitive that does not drain or mutate PTY state. Production currently
uses the fixed frame interval for deterministic pacing.

The cursor is composed into the same command encoding path as the instance
frame. Its upload-ring staging advances at most once for each rendered frame.
Compute and fullscreen paths remain isolated siblings for benchmark/test use;
they are not initialized by production `renderer_init`.

### Frame Failure and Requeue

```ts
damage_journal
  -> [surface, encoder, submit, or present failure]
    -> damage_requeue_journal
    -> next_render_frame
```

An empty journal remains a no-op. A failed frame does not permanently consume
text, scroll, or cursor damage; `damage_requeue_journal` restores the journal
before `damage_journal_destroy` releases its borrow and before the frame
transaction is abandoned. Runtime strategy selection is not part of the
production call graph.

## Core Architectural Invariants

### 1. Ring Buffer Row Storage (O(1) Scroll)

**Invariant**: Rows are NEVER moved during scrolling. Only the origin pointer is incremented.

**Structural Properties**:
- Grid capacity MUST be power-of-2: `capacity = 2^n`
- Physical row index = `logical_index & (capacity - 1)` (bitwise AND, not modulo)
- Scroll up by N: `origin = (origin + N) & (capacity - 1)`
- Scroll down by N: `origin = (origin - N) & (capacity - 1)`
- Row at logical position `r` is stored at physical position `(origin + r) & (capacity - 1)`

**Why This Invariant**:
- Moving rows during scroll is O(rows × cols) — unacceptable for large terminals
- Ring buffer makes scroll O(1) — only pointer arithmetic
- Power-of-2 enables bitwise AND instead of expensive modulo

**Validation**:
- After scroll, `grid.rows[(origin + r) & mask]` must return the correct row for logical position `r`
- Scroll up by 1: old row 0 becomes inaccessible (pushed to scrollback), old row 1 becomes new row 0
- Scroll down by 1: old last row becomes inaccessible, old row 0 becomes new row 1

### 2. Semantic Cell Representation

**Invariant**: Cells store handles/IDs, not full data. This enables deduplication and reduces memory.

**Structural Properties**:
```odin
Semantic_Cell :: struct {
    content:   Content_Handle,  // codepoint or grapheme handle
    style:     Style_Id,        // index into style table
    width:     u8,              // character width (1 or 2 for wide chars)
    flags:     Cell_Flags,      // bitfield: dirty, wide_continuation, etc.
}
```

**Why This Invariant**:
- Storing full styles (fg, bg, underline, flags) in every cell wastes memory
- Style table deduplication: 1000 cells with same style → 1 style entry + 1000 IDs
- Content handles enable grapheme cluster support without bloating cells

**Validation**:
- Cell size MUST be ≤ 16 bytes (target: 12 bytes)
- Style lookup: `style_table[cell.style]` returns full `Style` struct
- Content lookup: `content_table[cell.content]` returns rune or grapheme

### 3. Style Table Deduplication

**Invariant**: Styles are stored in a global table. Cells reference styles by ID, not by value.

**Structural Properties**:
```odin
Style :: struct {
    fg:        u32,      // foreground color (ARGB or palette index)
    bg:        u32,      // background color
    underline: u32,      // underline color
    flags:     u16,      // bitfield: bold, italic, underline_style, etc.
}

Style_Id :: u16  // index into style table
```

**Deduplication Algorithm**:
1. Hash the `Style` struct (fg, bg, underline, flags)
2. Look up hash in style table
3. If match found, return existing `Style_Id`
4. If no match, append new `Style` to table, return new `Style_Id`

**Why This Invariant**:
- Terminal output is highly repetitive (same style across many cells)
- Deduplication reduces memory: 1000 cells × 16 bytes (full style) = 16KB → 1000 cells × 2 bytes (ID) + 1 style × 16 bytes = 2KB + 16 bytes
- Cache-friendly: styles are contiguous in memory

**Validation**:
- `style_insert(s) == style_insert(s)` (idempotent)
- `style_table[style_insert(s)] == s` (round-trip)
- Table size ≤ 65536 (u16 limit)

### 4. Hierarchical Damage Tracking

**Invariant**: Damage is tracked at mutation time, NOT by comparing old/new grids.

**Structural Properties**:
```
Cell → Span → Row → Tile
```

- **Cell**: single cell mutation
- **Span**: contiguous range of cells in a row `[col_start, col_end)`
- **Row**: entire row is dirty (all cells)
- **Tile**: rectangular region (future, not Phase 1)

**Dirty Row Representation**:
```odin
Dirty_Row :: struct {
    generation:  u32,       // matches row.generation for validation
    span_count:  u8,        // number of spans (0-4)
    spans:       [4]Span,   // fixed array, degrade to full row if overflow
    full:        bool,      // true if entire row is dirty
}

Span :: struct {
    col_start: u16,
    col_end:   u16,
}
```

**Why This Invariant**:
- Comparing old/new grids is O(rows × cols) — unacceptable
- Tracking at mutation time is O(changed cells) — optimal
- Hierarchical representation enables efficient coalescing

**Validation**:
- After `grid_set_cell(g, r, c, cell)`, `damage.dirty_rows[r]` must contain span `[c, c+1)`
- After `damage_mark_row(d, r)`, `damage.dirty_rows[r].full == true`
- After `damage_take_journal`, damage is cleared (journal is consumed)

### 5. Row Generation Tracking

**Invariant**: Each row has a generation counter. Damage tracking uses generation to validate dirty spans.

**Structural Properties**:
```odin
Row :: struct {
    cells:       []Semantic_Cell,
    generation:  u32,  // incremented on every mutation
}
```

**Why This Invariant**:
- Enables detection of stale damage records (e.g., after resize)
- Renderer can skip rows whose generation hasn't changed
- Scroll operations preserve generation (row content unchanged)

**Validation**:
- After `grid_set_cell(g, r, c, cell)`, `g.rows[r].generation` is incremented
- After scroll, scrolled-in rows have generation = 0 (cleared)
- Damage span is valid only if `dirty_row.generation == row.generation`

### 6. Scroll Operation Semantics

**Invariant**: Scroll operations are structural — they rotate the ring buffer, NOT copy rows.

**Structural Properties**:
- `scroll_up(n)`: increment origin by n, clear bottom n rows
- `scroll_down(n)`: decrement origin by n, clear top n rows
- Scroll region: `[top, bottom]` — only rows in region are scrolled
- Rows outside scroll region are unaffected

**Why This Invariant**:
- Copying rows is O(n × cols) — unacceptable
- Ring buffer rotation is O(1) — optimal
- Clearing scrolled-in rows is O(n × cols) but only for new rows

**Validation**:
- After `scroll_up(1)`, logical row 0 is the old logical row 1
- After `scroll_up(1)`, logical row `rows-1` is cleared (generation = 0, cells = blank)
- Scroll region `[5, 10]` with `scroll_up(1)`: only rows 5-10 are affected

### 7. Damage Journal

**Invariant**: Damage journal is a snapshot of all dirty regions since last clear. Renderer consumes journal, not raw damage.

**Structural Properties**:
```odin
Damage :: struct {
    dirty_rows: []Dirty_Row,
    scroll_ops: [dynamic]Scroll_Op,
    journal_rows: []Dirty_Row,
    journal_ops: [dynamic]Scroll_Op,
    journal_active: bool,
}

Damage_Journal :: struct {
    dirty_rows: []Dirty_Row,  // borrowed from Damage.journal_rows
    scroll_ops: []Scroll_Op,  // borrowed from Damage.journal_ops
    borrowed: bool,
    owner: ^Damage,
}

Scroll_Op :: struct {
    top:    u16,  // top of scroll region
    bottom: u16,  // bottom of scroll region
    rows:   i16,  // positive = scroll up, negative = scroll down
}
```

**Why This Invariant**:
- Renderer needs to know WHAT changed (dirty rows) and HOW it changed (scroll ops)
- Scroll ops enable renderer to optimize: instead of redrawing all rows, just shift texture
- Journal is consumed (cleared) after renderer processes it
- Reusable journal storage avoids steady-state snapshot allocation

**Ownership Invariant**: `damage_take_journal` asserts that no borrow is
active, copies live damage into the reusable `journal_rows` and `journal_ops`
buffers, clears live damage, and returns a borrowed `Damage_Journal` with
`borrowed = true` and `owner = &Damage`. `journal_active` remains true until
`damage_journal_destroy`, which releases the borrow without freeing the
owner's reusable storage.

**Validation**:
- After `damage_take_journal`, damage is cleared
- Journal contains all mutations since last clear
- Scroll ops are recorded in order of occurrence
- Repeated take/destroy cycles reuse `journal_rows` and `journal_ops`
- `journal_active` is false after `damage_journal_destroy`

### 8. Zero Allocation in Steady State

**Invariant**: After initialization, no allocations occur during normal operation (character output, cursor movement, scroll).

**Structural Properties**:
- All data structures are pre-allocated in `init`
- Damage tracking uses fixed-size arrays (not dynamic lists)
- Style table is pre-allocated with capacity (e.g., 1024 entries)
- Ring buffer capacity is fixed at init

**Why This Invariant**:
- Allocations cause GC pressure (if using GC) or fragmentation (if using malloc)
- Terminal output is high-frequency (thousands of cells per second)
- Pre-allocation ensures predictable performance

**Validation**:
- `allocation_count` does not increase during steady-state operation
- Phase 0 benchmark harness tracks allocations

## Performance Targets

| Operation | Target | Rationale |
|-----------|--------|-----------|
| Cell mutation | O(1) | Direct array access |
| Scroll | O(1) | Ring buffer rotation |
| Damage tracking | O(changed cells) | Track at mutation time |
| Style lookup | O(1) | Direct array access |
| Damage journal | O(dirty rows) | Reusable snapshot, not allocation |

## Data Flow

```
Parser (Phase 2)
  │
  ├── terminal_put_char(c)
  │     ├── grid_set_cell(g, row, col, cell)
  │     │     ├── row = grid.rows[(origin + row) & mask]
  │     │     ├── row.cells[col] = cell
  │     │     ├── row.generation += 1
  │     │     └── damage_mark_cell(d, row, col)
  │     └── cursor.col += 1
  │
  ├── terminal_scroll_up(n)
  │     ├── origin = (origin + n) & mask
  │     ├── clear_rows(rows - n, rows - 1)
  │     └── damage_record_scroll(d, top, bottom, n)
  │
  └── terminal_take_damage()
        ├── assert !journal_active
        ├── copy into reusable journal_rows/journal_ops
        ├── damage_clear()
        └── return borrowed journal with owner
```

## MECE Completeness Matrix

| Operation | Happy Path | Edge Case 1 | Edge Case 2 | Edge Case 3 |
|-----------|------------|-------------|-------------|-------------|
| `grid_set_cell` | Result: cell updated, damage recorded | Crack: row/col out of bounds → no-op | Crack: style_id invalid → use default style | — |
| `scroll_up` | Result: origin incremented, rows cleared | Crack: n > rows → clamp to rows | Crack: scroll region empty → no-op | — |
| `damage_mark_cell` | Result: span added to dirty row | Crack: row out of bounds → no-op | Crack: span overflow (>4) → mark full row | — |
| `damage_take_journal` | Result: journal returned, damage cleared | Crack: no damage → return empty journal | — | — |
| `terminal_put_char` | Result: cell updated, cursor advanced | Crack: cursor at right edge → wrap to next line | Crack: cursor at bottom → scroll up | Crack: wide char → mark continuation cell |

## Implementation Order

1. **cell.odin** — Semantic_Cell, Content_Handle, Cell_Flags
2. **style.odin** — Style, Style_Id, style table with deduplication
3. **row.odin** — Row struct with generation tracking
4. **grid.odin** — Grid with ring buffer, cell access, scroll
5. **damage.odin** — Damage tracking, dirty rows, spans, journal
6. **scroll.odin** — Scroll operations (up, down, region)
7. **cursor.odin** — Cursor position and state
8. **terminal.odin** — Top-level API integrating all components

## Testing Strategy

**Unit Tests**:
1. Grid init/destroy, cell access, ring buffer scroll
2. Style table deduplication (insert, lookup, round-trip)
3. Damage tracking (mark cell, mark span, mark row, take journal)
4. Cursor movement (up, down, left, right, wrap)
5. Scroll operations (up, down, region, clamp)

**Integration Test**:
```odin
Input:  "hello\nworld"
Expected:
  row 0: h e l l o
  row 1: w o r l d
  cursor: (1, 5)
  damage: row 0 full, row 1 full
```

**Performance Tests** (using Phase 0 benchmark):
- Cell mutation: ns/cell (target: < 10 ns)
- Scroll operation: ns/scroll (target: < 50 ns)
- Damage tracking: ns/dirty_cell (target: < 5 ns)

## Configuration Subsystem & In-App Reload

**Location**: `src/config/` (`config.odin`, `parse.odin`, `load.odin`)
- **Format**: Flat declarative Odin key-value format parsed via `core:odin/parser` & `core:odin/ast`. Source wrapped in dummy procedure `package config\n_term_cfg :: proc() {\n<src>\n}` to allow `=` and `:=` syntax.
- **Diagnostics**: `-2` line offset correction reports exact line numbers from user's file. Thread-local error buffer prevents test races. Scoped `mem.Arena` prevents AST memory leaks during repeated reloads.
- **Discovery**: `$TERM_CONFIG` -> `~/.config/term/config.odin` -> `./term.odin`. Silent fallback to `config_default()` on missing file.
- **In-App Reload**: Bound to `Cmd+Shift+R` / `Ctrl+Shift+R` via `Input_Local_Action.Reload_Config` (leaving bare `Ctrl+R` for PTY reverse-i-search).
- **Atomic Application**: On theme change, updates `style_table.theme`, rebuilds `Style_LUT`, and marks full row damage for immediate repaint; font size changes trigger `_app_apply_zoom`. Syntax errors fail atomically without disturbing running terminal state.

## Tab & Chrome UI (v0.3 modernization)

**Design stance**: flat (no translucent/rounded GPU pipeline). "Chrome" = the UI furniture around the terminal grid (toolbar, tabs, search, dialog, context menu), not the content. Emphasis is UX/communication, not visual effects.

**Modules**
- `src/i18n/` — `Locale{en,id}`, `Strings` catalog, `i18n_get()` never-nil default English, `i18n_locale_from_env()` reads `LC_ALL/LC_MESSAGES/LANG`. Add a locale = add one `Strings` var. Config key `locale` selects ("" = auto). No user-visible string is hardcoded.
- `src/ui/tab_bar.odin` — overflow model: if `count*TAB_MIN_W(120) > avail_w` then `tab_w=120`, `scroll_max>0`, "+" pinned right; else `tab_w=min(TAB_MAX_W(220), avail_w/count)`. `out_rects[i]` already includes `-scroll_offset`, so `tab_bar_hit_test` returns the LOGICAL index directly (no mapping table). `Tab_Bar_State` also exposes `viewport_rect`, `title_rect`, `drag_rect`. `Tab_Bar_Anim` (cap 32) with `tab_bar_anim_update(dt,hover_ms,active_ms)` returns true only while moving, snaps to target then returns false (no idle repaint).
- `src/ui/tab_interaction.odin` — drag-reorder (`Tab_Drag_State`, 4px threshold, ghost + drop gap), context menu (`Tab_Menu_State`, 5 items, shortcut hints), inline rename (`Tab_Rename_State`, [128]u8).
- `src/app/session.odin` — `session_title_display` is the SSOT for the displayed name: user rename override takes precedence over OSC `title_buf`. OSC still writes `title_buf` (so clearing the override restores the in-flight OSC name). `session_reorder_tab` remaps `active_idx` by captured tab `id`; `session_close_others`/`session_close_to_right` wrap `session_close_tab`.
- `src/ui/confirm_dialog.odin` + `ui_render_stage(confirm_state=...)` — in-app flat confirm card (no scrim; renderer bg is opaque). Replaced native `NSAlert`.
- `src/platform/window/window.odin` — `Drag_Region` + `window_set_drag_region`; `_window_hit_test` returns `.DRAGGABLE` for the trailing toolbar area (`Tab_Bar_State.drag_rect`), letting the OS move the frameless window.

**Event routing priority** (`app_dispatch_input_events`): confirm dialog (modal, all kinds) → inline rename / context menu (key & pointer, modal) → global hotkeys → search → drag → tab bar → `_app_route_pointer` (PTY). Every modal branch `continue`s before PTY routing so nothing leaks. Closing a tab with a running process opens the in-app dialog; exited tabs close immediately.

**Draw order**: base bg → decor → interaction → base glyph → emoji → cursor → `ui_bg` (tab bar/tabs/search/dialog card) → `ui_glyph` (all UI text). Flat: no alpha/shadow.

## Tab & Chrome UI — v0.3 completion (2026-09-23)

- **Geometry (macOS-like, flat)**: `TAB_BAR_HEIGHT=28`, `TAB_MIN_W=110`, `TAB_MAX_W=200`, `NEW_TAB_BTN_WIDTH=28`, `CLOSE_BTN_WIDTH=22`, `TRAFFIC_LIGHT_OFFSET_DARWIN=76`, tab text pad `TAB_TITLE_PAD_LEFT=10`. UI chrome text is font-zoom-independent: `ui_render_stage` uses fixed `UI_CHROME_CELL_WIDTH/HEIGHT` (8x16), NOT `renderer.cell_width`, so `Cmd+=/-` never resizes the tab bar.
- **`tab_bar_layout`**: reserves `TAB_BAR_MIN_DRAG_W=100` at the trailing edge so a double-click/drag target always exists even when tabs overflow. Trailing cluster order is `[tabs viewport][overflow][+][reserved drag area]`. `title_rect == drag_rect`.
- **Overflow dropdown** (`src/ui/tab_overflow.odin`): history/identity bound by tab `id` (`selected_tab_id`), scrollable, keyboard nav (`Up/Down/Home/End/Enter/Escape`), pointer select + click-outside dismiss, auto-closes when the bar stops overflowing. Wired in `main.odin` as a modal (key + pointer) before global hotkeys/PTY routing; `App.tab_overflow`.
- **Shortcut registry** (`src/ui/shortcuts.odin`) is the SSOT: `ui_shortcut_label(a)` and `ui_shortcut_tab_label(i,count)` (`⌘1..⌘8`, last tab `⌘9`). Context menu (`tab_menu_item_shortcut`) delegates to it. Bindings in `main.odin`: `⌘T`, `⌘W`, `⌥⌘W`, `⌥⇧⌘W`, `⌘R`, `⌃⇥`/`⌃⇧⇥`, `⌘⇧[/]`, `⌘1..9`, `⌘F`, `⇧⌘\` (toggle overflow), `⌃⌘Z` (window zoom), plus Local zoom/reload. Hints are always visible as Tier-3 (`theme.text_faint`): per-tab `⌘N` badge, trailing legend `⌘T ⌘W ⇧⌘\` (+ optional `⌃⌘Z`), overflow row badges, confirm/search inline hints.
- **Title recency** (`session_update_title`): priority `fresh OSC > foreground process > cwd`; OSC is cleared on cwd change and on foreground start/end transitions so a stale shell title never masks a running command.
- **Window zoom**: double-click on the trailing drag area. On Darwin the native path is authoritative (SDL consumes draggable mouse events), so `app_frame` polls `win.window_take_titlebar_double_click(&a.drag_region)` → `win.window_zoom`; `Tab_Action.Window_Zoom` is the non-native fallback. `_app_set_drag_region` must preserve `pending_double_click`/`last_native_event`.

