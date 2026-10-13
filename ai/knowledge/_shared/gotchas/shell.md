# Gotchas — Shell & CI Ecosystem

General technical gotchas, traps, and workarounds for Shell scripting, macOS sandbox, and CI/CD pipelines (Zsh, macOS sandbox, GitHub Actions runner, Git submodules).

---

## [sh-01] 2026-08-29 GitHub Actions macos-14 Runner Missing Swift 6.0 / Xcode 16 [Status: Verified] [Agent: manual]
**Symptom**: `Package.swift` requires `swift-tools-version: 6.0`, but CI build fails on `macos-14` runners; `sudo xcode-select -s /Applications/Xcode_16.app` fails silently.
**Cause**: `macos-14` runners provide Swift 5.10 (Xcode 15) by default and lack Xcode 16 installations.
**Workaround**: Change workflow runner to `runs-on: macos-15`. The `macos-15` runner ships with Xcode 16.x and Swift 6.x as default without needing manual `xcode-select`.
**Anchors**: `runs-on: macos-15`, `Package.swift // swift-tools-version: 6.0`.

## [sh-02] 2026-09-04 CI/CD Verification Gate Discrepancy & Single-Source Pipeline [Status: Verified] [Agent: manual]
**Symptom**: Pull requests pass green on CI, but release builds fail immediately on previously masked integration or plugin regressions.
**Cause**: Partitioning verification by running fast unit tests on PRs while running full end-to-end and integration suites only on release tags creates a false sense of security.
**Workaround**: Centralize verification gates into a single-source script (`scripts/pipeline.sh` or `make pipeline`) executed identically across local pre-push git hooks, pull request CI, and release workflows.
**Anchors**: `scripts/pipeline.sh`, `make pipeline`.

## [sh-03] 2026-10-01 macOS Sandbox-Exec PATH & Subshell Binary Resolution [Status: Verified] [Agent: manual]
**Symptom**: `sandbox-exec: execvp() of '/opt/homebrew/bin/zsh' failed: Operation not permitted` (code 71) when running scripts inside sandboxed environments.
**Cause**: Restrictive macOS sandbox profiles (e.g. seatbelt profiles used by IDE agents) disallow executing binaries located under `/opt/homebrew/` or outside standard system binary directories (`/bin`, `/usr/bin`).
**Workaround**: Use system standard shells (`/bin/sh` or `/bin/zsh`) in script shebangs and command lines, or run subagent tools with sandbox bypass permissions when invoking Homebrew toolchains.
**Anchors**: `sandbox-exec`, `/bin/zsh`.
