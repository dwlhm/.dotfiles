# Gotchas — Dotfiles

## 2026-09-15 Running compiler/type checks mid-refactor triggers false errors and circular loops

**Symptom**: An implementer subagent runs a compiler or type check (e.g., `odin check`, `tsc`, `cargo check`) after modifying only one file in a multi-file refactor. The check fails with undefined symbols or mismatch errors in unchanged dependent files, causing the agent to panic, second-guess the plan, explore unrelated files, or read AI config rules instead of finishing edits.
**Cause**: Intermediate states during multi-file atomic edits are naturally incomplete and broken until all coupled files have been updated.
**Workaround**: Defer all verification (build, check, lint, test) until *after* all target files in the implementation plan have been modified (Batch Execution + Single End-of-Task Verification).
**Files**: `ai/agents/implementer.md` (Execution Rules).

## 2026-09-08 pi built-in tools include grep/find/ls — do not "fix" the tool list

**Symptom**: A config review flagged `AGENTS.md`'s "Built-in tools: read, bash, edit, write, grep, find, ls" as inaccurate, because the agent harness system prompt only exposes `read`, `bash`, `edit`, `write`.
**Cause**: pi 0.84.2 ships `grep`, `find`, `ls` as real built-in tools (`createGrepTool` / `createFindTool` / `createLsTool` in `dist/core/tools/`), but the running harness disabled them — harness exposure ≠ pi capability.
**Workaround**: Treat the pi docs' built-in tool list (`docs/extensions.md` "Overriding Built-in Tools") as authoritative; verify against `dist/core/tools/` before claiming a tool is missing.
**Files**: `ai/adapters/pi/AGENTS.md` (Tool Policy — correct as-is).

## 2026-09-08 EPIPE in stderr when piping pi JSON output through head

**Symptom**: `pi --mode json -p ... | head -5` exits with `Error: write EPIPE` in stderr, looking like a pi crash.
**Cause**: `head` closes the pipe early; pi's output-guard keeps writing to the closed stdout.
**Workaround**: Redirect full output to a file (`> out.json`) and inspect afterward; never pipe pi JSON streams through line-limiters.
**Files**: pi `dist/core/output-guard.js`.

## 2026-09-08 pnpm global store paths embed the package version

**Symptom**: Symlinks into `~/.Library/pnpm/global/5/.pnpm/@earendil-works+pi-coding-agent@<version>_ws.../` break after every pi upgrade.
**Cause**: The pnpm content-addressed store path contains the installed version.
**Workaround**: Never symlink config assets directly into the store; copy into `~/.dotfiles/ai/` and symlink from `~/.pi/agent/`. Re-sync copied files on upgrade (see `ai/extensions/subagent/README.md`).
**Files**: `ai/extensions/subagent/`, `~/.pi/agent/extensions/subagent/`.
