# Odin & Term Project

## Build / test / run (from `Makefile`)

- `make term` — release build → `bin/term`
- `make run` — build + run
- `make term-debug` — debug build
- `make test` — full suite (terminal, pty, composer, render, gpu, features, e2e)
- `make check` — `-strict-style` static check
- `make bench` / `make bench-quick` — benchmark harness

## Compiler flags (required)

- `-strict-style` is always on (`COMMON_FLAGS`).
- Release adds `-o:speed -no-bounds-check`.
- Darwin links: Metal, MetalKit, QuartzCore, Cocoa, IOKit.

## Core invariants (never violate)

1. Steady-state zero heap allocations after init (ring buffers, pools, caches pre-allocated).
2. ASCII fast path bypasses UTF-8 decoding and shaping.
3. O(changes) damage tracking: cell → span → row; upload only mutated cells.
4. Idle zero work: no redraw, recompile, or upload when nothing is dirty.

## Style

- Measure-first: every optimization is gated by percentiles (p50/p95/p99/p99.9), not intuition.
- Layout: `src/core` (engine), `src/features`, `src/app/term` (main), `src/cmd` (harnesses).
