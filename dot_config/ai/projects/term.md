# Term — Project Context

Odin terminal emulator, GPU-accelerated (Metal on macOS, wgpu on Linux). Odin `dev-2026-08+`.

## Commands (from the actual Makefile — trust this, not README.md)

- Build: `make term` (release → `bin/term`) / `make term-debug`
- Run: `make run`
- Test (full): `make test` — required before done
- Test (single): `make test-terminal` · `test-pty` · `test-session` · `test-tabs` · `test-multiplexer` · `test-interaction` · `test-composer` · `test-composer-frame` · `test-composer-scheduler` · `test-composer-transition` · `test-chrome` · `test-render-contract` · `test-gpu` · `test-features` · `test-e2e`
- Static check: `make check` (`-strict-style`) — required before done
- Bench: `make bench` / `make bench-quick` / `make bench-session`

## ⚠ README.md is stale

`README.md` documents `make build` / `release` / `install` / `bundle` / `build-mcp` targets and a flat `src/` layout that no longer exist. Do not follow it for commands or structure — use the Makefile and the actual tree below.

## Architecture (current)

- `src/core` — engine:
  - `terminal/` — VT state machine (cell, damage, egc graphemes, extension, grid, parser)
  - `render/` — atlas, chrome (batch/sdf/surface), contract, shaders, terminal (instance/tile/fullscreen), three_d
  - `chrome/` — draw_list, hit_test, modals, splits, tabs
  - `composer/` — blit, frame, layer, pipeline, scheduler, transition
  - `platform/` — pty, gpu/wgpu
- `src/features` — interaction, multiplexer, session, tabs
- `src/app/term` — app layer (main, input, keymap, command_center, chrome_view, terminal_view, composer_view, glyph_atlas, font, clipboard, layout, mouse, cursor, config)
- `src/cmd` — harnesses (harness_render_*, harness_composer, harness_features, bench_session, demo_session, test_e2e_real)

## Core invariants (never violate)

1. Steady-state zero heap allocations after init (buffers/pools pre-allocated).
2. ASCII fast path bypasses UTF-8 decoding and shaping.
3. O(changes) damage tracking: cell → span → row; upload only mutated cells.
4. Idle zero work: no redraw/recompile/upload when nothing is dirty.

## Style

- Measure-first: gate every optimization by percentiles (p50/p95/p99/p99.9), not intuition.
- `-strict-style` always on; never add allocations to hot paths.

## Definition of Done

- `make test` && `make check` green (show output).
- No new allocations in per-frame/hot paths.
