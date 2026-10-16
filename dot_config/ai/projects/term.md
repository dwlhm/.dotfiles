# Term — Project Context

## Commands

- Build: `make term` (release → `bin/term`) / `make term-debug`
- Run: `make run`
- Test: `make test` (full suite) — required before done
- Check: `make check` (`-strict-style`) — required before done
- Bench: `make bench` / `make bench-quick`

## Architecture

- `src/core` — engine (composer, render, platform/pty, platform/gpu).
- `src/features` — session, tabs, multiplexer, interaction.
- `src/app/term` — app layer (main, input, keymap, chrome_view, command_center, ...).
- `src/cmd` — harnesses.

## Core invariants (never violate)

1. Steady-state zero heap allocations after init (all buffers/pools pre-allocated).
2. ASCII fast path bypasses UTF-8 decoding and shaping.
3. O(changes) damage tracking: cell → span → row; upload only mutated cells.
4. Idle zero work: no redraw/recompile/upload when nothing is dirty.

## Style

- Measure-first: gate every optimization by percentiles (p50/p95/p99/p99.9), not intuition.
- `-strict-style` always on; never add allocations to hot paths.

## Definition of Done

- `make test` && `make check` green (show output).
- No new allocations in per-frame/hot paths.
