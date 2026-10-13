# Work in Progress — term

## Active
- [ ] Transparency + blur continuation — 2026-10-03: revised user contract scales every emitted terminal background paint (default/pane fill, ANSI, selected, direct-color); direct-color authored alpha multiplies configured opacity. Foreground/decorations/chrome and existing inactive-pane dimming remain independent. Normal source-over layering is retained, so overlapping paints can yield final alpha above configured per-paint opacity. Premultiplied clear and ANSI-black fixes retained. Separate cell_opacity uniforms preserve dormant fullscreen/compute source parity; those shaders remain uncompiled/unexecuted. Verification for this revision: red render regression reproduced (1 expected failure among 165 tests), then make check/build and diff-check passed. Green render tests and GPU/visual verification were not run per latest direction. Earlier native probe passed all nine {0, 0.5, 1} opacity/blur combinations; no app launch or capture for this revision. Anchors: `render_cell_expand_instance @ src/render/render_cell.odin:304`, `_renderer_sync_bg_opacity @ src/render/renderer.odin:866`, `test_terminal_background_opacity_reaches_full_and_dirty_instances @ src/render/tests/upload_dirty_test.odin:330`, `docs/architecture.md:486`.
- [ ] Resize-lag investigation via automated xctrace profiling — scenario: `ls` then width ladder (100→50→70→40→90→30→100%) then height ladder (same percentages), relative to initial window size — started 2026-09-26
- [ ] Production event architecture discussion (event-based core, PTY/input ownership, queue backend) — deferred, will continue in a separate session

## Recently Completed
- [x] Hardened SDL/macOS paste-shadow routing across normal and worker backend paths — completed 2026-09-30 — anchors: `src/platform/input/pump.odin:115`, `src/app/main.odin:1226`, `src/app/backend.odin:1081`, `src/app/tests/app_test.odin:649`
- [x] Profiler drop telemetry made non-fatal in the stress script (count still reported) — completed 2026-09-26
- [x] Profiler e2e scenario: shell-ready gate, `stty -echo`, `ls` + done-marker, 12-step resize ladder with per-step telemetry (kinds Width_Step=11/Height_Step=12) — completed 2026-09-26
- [x] Latest clean matrix: `artifacts/resize-profile-20260926-070708-NaJXy2` (all 4 captures valid, dropped=0) — completed 2026-09-26
