# Gotchas — term

## 2026-09-30 Worker paste-shadow must bypass PTY fallback
**Symptom**: A paste appears twice only on the worker/UI_Event input path.
**Cause**: `backend_handle_ui_event` falls back to `input_pump_events` for unconsumed keys, unlike the normal app dispatcher’s `paste_shadow` guard.
**Workaround**: Mark matching SDL text as `paste_shadow`; the worker must return before fallback unless interaction is Search; Search remains the text consumer.
**Files**: `src/platform/input/pump.odin:115`, `src/app/main.odin:1226`, `src/app/backend.odin:1081`, `src/app/tests/app_test.odin:649`.

## 2026-09-26 `_profile_resize_case` expect_grid_change means "change MUST happen", not "allow either"
**Symptom**: A profiling resize step that changes the grid fails with `grid_change_missing` when called with `expect_grid_change=false`.
**Cause**: `_profile_resize_case` compares `expect_grid_change != grid_changed` and fails on mismatch, so `false` asserts the grid did NOT change; it is not a wildcard.
**Workaround**: Pass `expect_grid_change=true` for resize steps that must alter rows/cols; `false` is only correct for guaranteed no-ops.
**Files**: `src/app/main.odin:62` (`_profile_resize_case`), `src/app/main.odin:158` (ladder call site).

## 2026-09-26 Profiler scenario stuck in Running: done-marker never observed
**Symptom**: A profiling capture ends with `scenario.status` = `invalid` / `reason=scenario_failed` and `resize_kind=Scenario_Phase`; trace TOC shows the app lived ~30 s and exited 0.
**Cause**: The scenario's 30 s phase deadline fired while still waiting for the contiguous `PROFILE_DONE_<id>` marker in the terminal grid — usually a cold/first xctrace launch where the instrumented shell (zsh + user config) was slow to start, or the typed command raced shell init. With the shell-ready gate, the scenario now waits for grid output before typing `stty -echo` and the `ls` command.
**Workaround**: Rerun the capture (subsequent runs are typically valid). In telemetry-enabled captures, diagnose via CSV: 2 kind-0 rows (Idle+Running) and no kind-11/12 rows means the deadline fired in `.Running`.
**Files**: `src/app/profile_scenario.odin` (`profile_scenario_observe_terminal`, `profile_scenario_shell_ready`), `src/app/main.odin:171` (`_profile_scenario_step`).

## 2026-09-23 UI glyphs must be pinned in the atlas or they render at random/nothing
**Symptom**: Shortcut labels (⌘T, ⌥, ⇧, ⌃, ⇥, ↵) and any custom UI symbol are missing or garbage.
**Cause**: `atlas_get_slot` maps only pinned codepoints to their real slot; any other codepoint falls back to `slots[codepoint % 512]`, which is a dynamic terminal-fallback slot (usually invalid, or another glyph on hash collision). UI staging (`emit_char`) never rasterizes on demand.
**Workaround**: Add the codepoint to `PINNED_EXTRA_CODEPOINTS` in `src/render/atlas_prewarm.odin` (and include it in `atlas_prewarm_set` + `atlas_pinned_slot_index`), adjusting `PINNED_TOTAL`/`PINNED_SLOT_EXTRA`. The pinned budget is 512 slots total.
**Files**: `src/render/atlas_prewarm.odin`, `src/render/atlas.odin:136`, `src/render/tests/atlas_test.odin`.

## 2026-09-23 SDL draggable hit-test masks mouse events; double-click must be polled natively
**Symptom**: A native double-click on the tab-bar trailing area does not zoom the window; `Tab_Action.Window_Zoom` never fires on macOS.
**Cause**: When `_window_hit_test` returns `.DRAGGABLE`, SDL/AppKit consumes the mouse-down for window dragging and does not emit button events to the app. The double-click is detected inside the OS hit-test callback and queued in `Drag_Region.pending_double_click`.
**Workaround**: Poll `win.window_take_titlebar_double_click(&a.drag_region)` from `app_frame` and call `win.window_zoom`. CRITICAL: `_app_set_drag_region` must carry over `pending_double_click` and `last_native_event` — rebuilding `Drag_Region` wholesale each layout pass erases the queued click before it is consumed.
**Files**: `src/platform/window/window.odin`, `src/app/main.odin` (`app_frame`, `_app_set_drag_region`).

## 2026-09-23 Installed app fonts must resolve relative to the executable
**Symptom**: Prompt icons become missing-glyph boxes in the installed macOS app while launching `./bin/term` from the repository works.
**Cause**: The bundle contains its fonts, but cwd-relative font candidates miss `Contents/Resources/fonts` when the app starts elsewhere; system fonts may lack Nerd Font glyphs.
**Workaround**: Prepend executable-relative `../Resources/fonts` and `../assets/fonts` candidates for primary and fallback loading at startup and zoom, preserving legacy search order afterward. Keep the selected primary path owned until frontend destruction (or initialization failure); release temporary fallback candidate strings after synchronous rasterizer loading. Verify an installed launch from an unrelated directory, not only a repository launch.
**Files**: `Makefile:23`, `src/app/frontend.odin:102`, `src/app/frontend.odin:128`, `src/app/frontend.odin:229`, `src/app/frontend.odin:289`, `src/app/frontend.odin:485`, `src/app/tests/font_paths_test.odin:31`.

## 2026-09-13 DSR CSI 5 n vs CPR CSI 6 n (Neovim E1568)
**Symptom**: Neovim 0.10+ displays "E1568: Terminal did not respond to DSR request for 'background' color."
**Cause**: Neovim sends `OSC 11;?\007\027[5n`. The terminal treated parameter 5 as CPR, replying with `\e[1;1R` instead of `\e[0n` (OK status).
**Workaround**: Handle `params.values[0] == 5` with `\x1b[0n` and `params.values[0] == 6` with CPR `\x1b[<row>;<col>R`.
**Files**: `src/parser/csi.odin:627`

## 2026-09-13 Secondary DA (CSI > c) vs Primary DA (CSI c / CSI ? c)
**Symptom**: Vim/Neovim/tmux feature detection issues on startup.
**Cause**: `CSI > c` was answered with Primary DA `\e[?62c` instead of Secondary DA `\e[>0;10;0c`.
**Workaround**: Branch on `p.intermediate == '>'` to emit `\x1b[>0;10;0c`.
**Files**: `src/parser/csi.odin:606`

## 2026-09-13 Alternate screen mouse wheel fallback
**Symptom**: Mouse wheel in `less`, `man`, `git log`, `git diff` does nothing.
**Cause**: In alternate screen with mouse tracking off (`mouse_tracking == .None`), wheel events were dropped.
**Workaround**: Translate wheel deltas into 3x Arrow Up (`\e[A` / `\eOA`) or 3x Arrow Down (`\e[B` / `\eOB`).
**Files**: `src/app/main.odin:704`

## 2026-09-13 Synchronized Output (Mode 2026)
**Symptom**: Large redraws in Neovim/tmux/btop flicker or tear.
**Cause**: Frames were presented mid-update between `CSI ? 2026 h` and `l`.
**Workaround**: Defer `render.renderer_frame` while `synchronized_output` is true (with a 100ms safety timeout).
**Files**: `src/terminal/terminal.odin:70`, `src/terminal/terminal.odin:656`, `src/parser/csi.odin:418`, `src/app/main.odin:1223`

## 2026-09-13 XTGETTCAP responses use +r, not +q
**Symptom**: Random hex text (`696e646e...=44617277696e`) appears on the fish command line at startup.
**Cause**: xterm XTGETTCAP requests use `DCS +q` but responses MUST use `DCS 1+r`. Echoing `+q` makes fish's `parse_dcs` (src/input/decode.rs) reject the response and dump the payload as typed input. Verified against fish source + E2E with real fish 4.8.
**Workaround**: Send `DCS 1+r<param> ST` (boolean) and `DCS 1+r<param>=<hex> ST` (string). Same class of bug: keep DA as canonical `CSI ? 62 c` (no trailing separator).
**Files**: `src/parser/parser.odin` (dcs_dispatch), `src/parser/csi.odin` (_csi_execute_da)

## 2026-09-13 ASCII fast path must run wide-overwrite repair
**Symptom**: Deleting a 2-cell emoji (e.g. ⚠️ U+26A0 U+FE0F) leaves an undeletable ghost half on screen; further deletes do nothing visible.
**Cause**: Shells erase a wide char with single-cell destructive backspace (BS, space, BS). The slow path called `_wide_overwrite_repair` but the ASCII fast path in `terminal_put_char` wrote directly, so a space landing on a wide continuation never blanked the orphaned lead.
**Workaround**: Call `_wide_overwrite_repair(t, row, col, 1)` in the ASCII branch before `grid_set_cell`. Cost is one bounds-checked read in the common case; the ascii-cost invariant test still passes because it only greps the branch text, not callees.
**Files**: `src/terminal/terminal.odin:127`

## 2026-09-13 xenl deferred wrap is required for fish autosuggestions
**Symptom**: Typing after a fish autosuggestion appears moves the cursor down one row and right one column; suggestions smear across lines.
**Cause**: `cursor_advance` wrapped to the next line immediately upon reaching the last column. Fish renders suggestions via save/move/print/restore (DECSC/DECRC); the premature wrap corrupted the saved position's row context so restore landed wrong.
**Workaround**: Implement xenl: `Cursor.pending_wrap` stays set at the last column; the line advance happens in `terminal_put_char`/`_slow`/`_wide` before the next write. Every cursor-moving op (CUU/CUD/CUF/CUB/CUP/BS/CR/newline/linefeed/restore/resize/IL/DL) must clear the flag.
**Files**: `src/terminal/cursor.odin:4`, `src/terminal/terminal.odin:67`

## 2026-09-13 SGR colon vs semicolon must be distinguished in the parser
**Symptom**: `ESC[4:2m` (curly underline) incorrectly enables dim mode; `ESC[58:2::R:G:B` misparses RGB channels.
**Cause**: `csi_collect_param` collapsed `:` into `;`, so `4:2` was indistinguishable from `4;2` (underline+dim) and the empty field in `38:2::R:G:B` shifted channels.
**Workaround**: Track `csi_subparam[16]` in the Parser, copy into `CSI_Params.subparams`, and branch on it in `_csi_execute_sgr` (underline variants consume the colon-joined subparam; truecolor skips one zero subparam for the empty colon field).
**Files**: `src/parser/csi.odin:5`, `src/parser/parser.odin:11`

## 2026-09-13 Parser test callbacks must be thread-local
**Symptom**: Fish-compat tests using package-global capture buffers fail intermittently (phantom responses, length mismatches).
**Cause**: Odin runs package tests on multiple threads; plain globals race between concurrently executing tests.
**Workaround**: Mark capture buffers/counters `@(thread_local)` instead of sharing globals or adding mutexes.
**Files**: `src/parser/tests/fish_compat_test.odin:13`

## 2026-09-13 Kitty keyboard pop must restore, not reset, on exact depth
**Symptom**: Vim exits leaving fish's disambiguate flag cleared; subsequent fish input falls back to ambiguous legacy encodings.
**Cause**: Popping exactly the stacked depth was implemented as "empty stack → reset to 0" instead of restoring the oldest saved state.
**Workaround**: `terminal_kitty_pop` restores `stack[depth-n]` and only resets on over-pop (`n > depth`).
**Files**: `src/terminal/terminal.odin:1146`

## 2026-09-12 Frame publication and teardown require verified GPU completion
**Symptom**: A frame or resource lifecycle can appear successful even when surface presentation fails, or teardown can mutate GPU resources while work is still in flight.
**Cause**: Publication is valid only after successful queue submission and surface presentation; teardown must not proceed when queue completion cannot be verified.
**Workaround**: Propagate the presentation status through `_renderer_surface_commit` and requeue damage on failure. Gate destruction through `_renderer_wait_for_gpu` before releasing resources.
**Files**: `src/render/renderer.odin:271`, `src/render/renderer.odin:339`, `src/render/renderer.odin:419`, `src/render/gpu/wgpu/wgpu.odin:247`

## 2026-09-12 Shell prompt markers belong at the PTY environment boundary
**Symptom**: Running `clear` can leave a visible `%` marker at the beginning of the next prompt.
**Cause**: The shell's end-of-line prompt marker is emitted when the terminal line does not end in a newline; it is not terminal-parser content.
**Workaround**: Set `PROMPT_EOL_MARK` in the shell environment created by `pty_spawn`; do not filter the marker from terminal output in `parse_chunk`.
**Files**: `src/platform/pty/pty.odin:67`, `src/app/main.odin:139`, `src/app/main.odin:153`

## 2026-09-12 OSC/DCS terminators must survive PTY read boundaries
**Symptom**: Shell output after a prompt-control sequence can disappear or render incorrectly when the sequence is split across PTY reads.
**Cause**: OSC/DCS string state and an ESC terminator can span multiple `parse_chunk` calls; BEL, ST, CAN, and SUB must be interpreted from persistent parser state.
**Workaround**: Preserve the active string kind and pending ESC state across chunks, then dispatch the terminator only when the complete control sequence arrives.
**Files**: `src/platform/pty/pty.odin:245`, `src/parser/parser.odin:21`, `src/parser/parser.odin:60`, `src/parser/vt.odin:292`, `src/parser/vt.odin:314`, `src/parser/csi.odin:42`

## 2026-09-12 TUI rendering requires full xterm-256color cursor and editing escape sequences
**Symptom**: In Vim/Neovim, moving cursor between lines causes text from one line to overwrite or corrupt text on another line.
**Cause**: When TERM=xterm-256color is exported, Vim optimizes cursor movement using VPA (CSI <n> d), CHA (CSI <n> G), HVP (CSI <r>;<c> f), and line edits IL/DL/ECH/RI. When these sequences are dropped, cursor remains at the wrong position and subsequent text output overwrites unintended lines.
**Workaround**: Implement full CSI dispatch for VPA, CHA, HVP, ECH, IL, DL, and ESC RI, plus Alternate Screen Buffer (mode 1049) to isolate TUI workspace from shell scrollback.
**Files**: `src/parser/csi.odin:53`, `src/parser/parser.odin:237`, `src/terminal/terminal.odin:700`

## 2026-09-16 FreeType FT_Face is mutable and non-thread-safe
**Symptom**: Intermittent assertion crashes (`churn claim must succeed`) and deadlocks in background raster worker during shutdown (`test_raster_eviction_impossible`).
**Cause**: FreeType's `FT_Face` mutates internal face state even during read/rasterization operations (`FT_Load_Glyph`, `FT_Set_Pixel_Sizes`). Concurrent access between the main render thread (`fallback_resolve`, `atlas_dynamic_claim_p`) and background worker (`_raster_rasterize`) corrupts FreeType C library state.
**Workaround**: Add `mutex: sync.Mutex` to `Fallback_Chain` and serialize all FreeType queries and glyph rasterization under `chain.mutex`.
**Files**: `src/render/fallback.odin`, `src/render/raster_async.odin`, `src/render/atlas.odin`

## 2026-09-16 Alt Screen resize must preserve Primary Screen without scrollback pollution
**Symptom**: Resizing terminal window while running Neovim or htop wipes shell history or pushes TUI buffer rows into scrollback.
**Cause**: Alt screen buffer does not have scrollback history; resizing naively either ran reflow on the active alt screen (polluting scrollback) or discarded the inactive primary buffer.
**Workaround**: When `t.is_alt_screen` is true during resize, temporarily swap active and alt grids, perform full reflow on primary grid, then adapt alt grid dimensions via `_grid_resize_alt` with grapheme cleanup and zero scrollback pushing.
**Files**: `src/terminal/resize.odin`

## 2026-09-16 Scrollback column reflow must not split wide character cells
**Symptom**: Shrinking terminal columns causes wide CJK/emoji characters to display corrupted continuation halves or split across rows.
**Cause**: When slicing rows at `take == new_cols`, a wide lead character at `ci + take - 1` with a continuation at `ci + take` is cut in half.
**Workaround**: If `ci + take` lands between a wide lead and continuation, decrement `take` by 1 so the lead wraps cleanly to column 0 of the next row.
**Files**: `src/terminal/scrollback.odin:122`

## 2026-09-17 Odin test runner multithreading with Cocoa/SDL3 deadlocks on macOS
**Symptom**: `odin test src/app/tests` hangs indefinitely without completing.
**Cause**: Odin test runner defaults to multithreaded test execution (`os.processor_core_count()` threads). On macOS, Cocoa/AppKit APIs (`CFPreferencesCopyAppValue`, `SDL_CreateWindow`, `SDL_Init`) must execute on the main thread (Thread 0). When invoked from auxiliary test worker threads, Cocoa blocks waiting for the main run loop.
**Workaround**: Always run app-level tests with `-define:ODIN_TEST_THREADS=1` as configured in the project Makefile (`TEST_FLAGS`).

## 2026-09-17 Process group signal kill requires strict PID > 1 guard
**Symptom**: Calling `posix.kill(-pid, SIG...)` kills the entire operating system session or the terminal process itself.
**Cause**: If `pid == 0`, `kill(0, ...)` targets the caller's process group. If `pid == -1` or negative, `kill(-1, ...)` targets all processes owned by the user.
**Workaround**: Strictly enforce `if session.backend.pty.pid > 1` before invoking `posix.kill(-pid, ...)`.

## 2026-09-22 Tab reorder rotates a 1.3 MB element → stack overflow warning
**Symptom**: `session_reorder_tab` compiler warning: declaration of a `Tab_Session` temporary "may cause a stack overflow" (embedded `Backend`+`Terminal`, ~1.3 MB).
**Cause**: `Tab_Session` is a large value type; a stack temporary for in-place array rotation exceeds safe stack size.
**Workaround**: Use a single heap scratch (`new(Tab_Session)` + `defer free`) for the rotation. This is a per-user-action allocation, NOT steady-state; acceptable. Do not treat it as a zero-alloc violation.
**Files**: `src/app/session.odin`

## 2026-09-22 Flat UI cannot dim/modal-scrim with the opaque bg pipeline
**Symptom**: The confirm dialog has no darkened backdrop.
**Cause**: UI background quads go through the `.Opaque` bg pipeline (`emit_bg` forces `a=1.0`); alpha is ignored, so a translucent scrim is impossible without a new alpha-blended pipeline.
**Workaround**: By design (flat), omit the scrim; rely on the raised `surface_card` + border. If a scrim/translucency is ever required, add a dedicated alpha-blended chrome pipeline rather than trying to force `emit_bg`.
**Files**: `src/ui/ui_render.odin`, `src/render/instance/instance.odin`

## 2026-09-22 `_app_stage_ui` stages UI every tick (pre-existing idle-work leak)
**Symptom**: The renderer's `ui_staged` is effectively always true, so `renderer_frame` never reaches a true idle no-op.
**Cause**: `_app_stage_ui` runs each frame and always emits the tab-bar background.
**Workaround**: Known pre-existing issue, unchanged by the v0.3 tab work. Animations are still gated by `anim_active` and terminate to an exact rest. A proper fix would gate staging behind a UI dirty flag — tracked, not yet done.
**Files**: `src/app/main.odin` (`_app_stage_ui`), `src/render/renderer.odin`

