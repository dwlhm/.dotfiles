# Gotchas — Supernova

Project-specific gotchas, internal architectural traps, and closed proprietary workflows for Supernova.

---

## [supernova-01] 2026-10-05 Dispatch-Only Workflow Triggered Nothing On Merge [Status: Verified] [Agent: pi]
**Symptom**: The design-system CI pipeline never ran, yet every PR merged into `main` appeared successful; the repo had zero workflow runs despite a valid workflow file.
**Cause**: `.github/workflows/design-system-ci.yml` declared only `repository_dispatch` (`types: [supernova-release]`) and `workflow_dispatch`. Merging a PR into `main` emits a `push` event, which the workflow did not listen to, so nothing ran — for the entire life of the repo.
**Workaround**: Add `on: push: branches: [main]`. Anti-loop requirement: the bot's own commit must carry `[skip ci]` or the workflow retriggers itself; a `branches:` filter also prevents tag-only pushes from retriggering. Diagnostic recipe separating "wrong trigger" from "broken workflow": `gh api repos/<owner>/<repo>/actions/runs?per_page=20 --jq '.total_count'` returning `0` proves it never ran; `gh api repos/<owner>/<repo>/actions/workflows` showing `state: active` proves the file is valid and registered; `gh api repos/<owner>/<repo>/hooks` returning `[]` proves a `repository_dispatch` trigger is unreachable.
**Files**: `.github/workflows/design-system-ci.yml`.

## [supernova-02] 2026-10-05 Two Unconnected Artifact Paths: Supernova Root Sync vs Mock Fixture [Status: Verified] [Agent: pi]
**Symptom**: Generated packages and docs reflected the mock fixture, not the real Supernova design system, while appearing to build successfully.
**Cause**: The Supernova GitHub app syncs the export to the **repository root** (`index.ts`, `tokens/`), driven by `config.json` (`tokensDir: "tokens"`, `componentsDir: "components"`, `generateIndexFile: true`); PR #1 landed exactly those files. Independently, `exporter/mock/runner.js` writes its fixture export to `output/`, and the generation scripts originally read `output/` hardcoded (`scripts/sync-tokens.js:5`, `scripts/generate-components.js:6`, `scripts/generate-docs.js:5-6`). The two paths never met: CI generated packages/docs from the **66-declaration mock fixture**, not the real design system. The root-synced `tokens/tokens.ts` held **108 declarations / 241 lines**; the mock `output/tokens/tokens.ts` held only **66 declarations / 129 lines**.
**Workaround**: `scripts/export-source.js` resolves the export root once (`--source=<dir>` > `SUPERNOVA_EXPORT_DIR` > repo root) and derives artifact directories from `config.json` defaults, so new artifact kinds need no script change. Absent artifacts warn loudly and skip; `tokens` absence is a hard failure.
**Files**: `scripts/export-source.js`, `exporter/mock/runner.js`, `scripts/sync-tokens.js:5`, `scripts/generate-components.js:6`, `scripts/generate-docs.js:5-6`.
**Note**: The root sync has NOT yet carried `components/`, so `packages/*/src` and `docs/components/*` remain mock-derived until Supernova syncs that directory.
**Pitfall**: `grep -c -- '--'` counts preamble comment lines and over-reports (52 `--color-*` disambiguation comments); count declarations with `grep -cE '^\s*--[a-zA-Z0-9_-]+\s*:'`.

## [supernova-03] 2026-10-05 Pages Project Site Inherits The User-Site Custom Domain [Status: Verified] [Agent: pi]
**Symptom**: `Deploy to GitHub Pages` reports success, but the published site is unreachable; `https://dwlhm.github.io/supernova/` returns `301 -> http://blog.dwlhm.space/supernova/`, and DNS for `blog.dwlhm.space` is NXDOMAIN.
**Cause**: `dwlhm/supernova` project Pages inherits the custom domain configured on the user site `dwlhm/dwlhm.github.io` (`cname: "blog.dwlhm.space"`, `build_type: legacy`). The repo's own Pages object reports `cname: null` yet `html_url: "http://blog.dwlhm.space/supernova/"`. A successful deploy step is therefore NOT evidence that the site is reachable — verify the URL separately.
**Workaround**: Verify the deployed URL independently of the deploy step. The VitePress base path must match the served sub-path: `docs/.vitepress/config.mts:6` reads `process.env.BASE_URL`, and the workflow sets `BASE_URL: /supernova/`; a mismatch silently ships HTML whose assets 404.
**Files**: `.github/workflows/design-system-ci.yml`, `docs/.vitepress/config.mts:6`.
**Open**: `pages.https_enforced` is `false`, which keeps the site on http — not yet resolved.
