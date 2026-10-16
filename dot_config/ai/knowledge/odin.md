# Odin Language

## Compiler flags

- `-strict-style` — static style check; enable in all builds.
- `-o:speed` — release optimization.
- `-no-bounds-check` — disable bounds checks (release only).
- `-debug` — debug build.
- `-define:NAME=value` — compile-time constant.
- `-no-entry-point` — check/compile a package without `main`.
- `-minimum-os-version:<v>` — deployment target.
- `-extra-linker-flags:"..."` — extra linker flags.
- `-target:<triple>` — cross-compile (e.g. `linux_arm64`).

## macOS Metal apps — link frameworks

Metal, MetalKit, QuartzCore, Cocoa, IOKit.

## Tests

- `odin test <pkg>` runs the `tests/` subpackage of `<pkg>`.
- `-define:ODIN_TEST_THREADS=1` for deterministic single-threaded tests.
