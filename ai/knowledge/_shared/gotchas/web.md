# Gotchas — Web Ecosystem

General technical gotchas, traps, and workarounds for modern Web development (SharedArrayBuffer, Web Workers, Vite, RSC, React 19, scraping).

---

## [web-06] 2026-10-05 Hardcoded SSG Nav Outlives Generated Content [Status: Verified] [Agent: pi]
**Symptom**: An SSG whose sidebar/nav lives in hand-written config, plus a content generator whose copy is a static template, keeps advertising content after the generated artifacts disappear. Nothing warns; the pages are simply stale-but-linked — the sidebar still links the pages and the home page still promises a component library.
**Cause**: Concrete case: VitePress `themeConfig.nav`/`sidebar` in `docs/.vitepress/config.mts` listed six component pages literally, and a `generateIndexDoc()` template hardcoded package rows and framework quick-start samples. When the component artifact stopped being produced, the guard only skipped *writing* new pages — it never removed committed ones, so they survived on disk and stayed published.
**Workaround**: Guard rails worth applying: (1) one generated manifest as the single owner of the set, consumed by both the SSG config and the content generator; (2) prune — never only skip writing, because committed artifacts survive on disk and stay published; (3) make content-generator copy conditional on the same manifest; (4) verify against the BUILT output, not the source config, since conditionals can be inert in source yet correct at build time. Diagnostic: grep the built site directory, not the config, for the claimed entity, and check the claimed pages return 200.
**Anchors**: repo `dwlhm/supernova`; commit `c603292` introduced the manifest; GitHub Actions run `37286698155` deployed the corrected site; after deploy `https://dwlhm.github.io/supernova/components/` returned 404 and the built home page contained zero `/components/` links. Note the false positive to expect: VitePress's own theme emits the string `Button` in its `DocSearch-Button*`/`VPButton` class names, so a naive grep for `Button` in built HTML never reaches zero.

## [web-05] 2026-10-05 VitePress Does Not Rewrite `head` Link hrefs With `base` [Status: Verified] [Agent: pi]
**Symptom**: On a GitHub Pages project site served from a sub-path (e.g. `/supernova/`), the favicon — or any asset declared in the `head` config array — 404s while every generated asset and page link loads fine. The build output emits no warning about it.
**Cause**: VitePress prefixes generated asset and page URLs with `base`, but it does NOT rewrite `href`/`src` values supplied in the `head` config array. A hardcoded `href: '/favicon.svg'` therefore resolves against the domain root, not the site's base path. Compounding trap: a `head` reference to a file that does not exist in `docs/public/` is also a silent 404 — `public/` is the only directory whose contents are copied to the site root, so a missing file is invisible in the build and only surfaces when the deployed page is inspected.
**Workaround**: Hoist the base into a named constant, pass it to `defineConfig`, and build the href from it:
```ts
const base = process.env.BASE_URL || '/'
export default defineConfig({ base, head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }]] })
```
VitePress normalizes `base` to always carry both a leading and a trailing slash, so string concatenation is safe. Verification method — do not trust the config file; build with the production base and grep the emitted HTML: `BASE_URL=/supernova/ npx vitepress build docs` then `grep -o 'rel="icon"[^>]*' docs/.vitepress/dist/index.html`. Also confirm the file landed at `docs/.vitepress/dist/favicon.svg`.
**Anchors**: deployed artifact of GitHub Actions run `37282413994` (repo `dwlhm/supernova`) emitted `rel="icon" ... href="/favicon.svg"`; commit `147df34` changed it to `` href={`${base}favicon.svg`} ``; run `37283824516` then emitted `href="/supernova/favicon.svg"`, and `https://dwlhm.github.io/supernova/favicon.svg` returned HTTP 200 with `content-type: image/svg+xml` (393 bytes).

## [web-04] 2026-10-05 esbuild Plugin Namespaces Bake Absolute Paths Into Bundles [Status: Verified] [Agent: pi]
**Symptom**: A local build of a bundled artifact passes a `git diff --exit-code` reproducibility gate, but every CI runner reports a one-line diff in the committed bundle — and the diff is an absolute path, not a content change.
**Cause**: esbuild (verified on 0.27.7) emits a header comment `// <namespace>:<args.path>` at the top of inlined content for any file a plugin loads via `onLoad` in a custom (non-`file`) namespace. The emitted path is exactly the string returned as `path` in `onResolve`, so returning an absolute path (e.g. `resolve(args.resolveDir, ...)`) bakes the build machine's absolute path into the committed bundle. The reproducibility gate then passes only on the machine that produced the bundle and fails on every CI runner.
**Workaround**: Return a machine-independent string as `path` (the bare import specifier works) and pass the real filesystem location through `pluginData`, which esbuild forwards to `onLoad`. Diagnostic shortcut: a single-line diff between a local build and a CI build that differs only by an absolute path is this trap, not a real content difference. Empirical proof: two builds of the same source under different roots produce byte-identical output once the path is machine-independent; before the fix the diff was exactly one line (`// runtime-source:/Users/.../exporter/src/runtime/component-runtime.ts` vs `// runtime-source:/home/runner/work/supernova/supernova/exporter/src/runtime/component-runtime.ts`).
**Anchors**: esbuild 0.27.7; `runtime-source` namespace; `exporter/tsup.config.ts`; fix commit `aee5971`.

## [web-01] 2026-08-30 DuckDuckGo Scraping Fragility & Two-Step Image VQD Flow [Status: Verified] [Agent: manual]
**Symptom**: Web search scraping breaks silently with empty results or image queries fail to parse.
**Cause**: Web results come from `html.duckduckgo.com/html/?q=` scraping; images require a two-step flow: fetch the query page to extract the `vqd` token, then call `duckduckgo.com/i.js?...&vqd=<vqd>`. Result hrefs may be `/l/?uddg=<percent-encoded>` redirect wrappers with no SLA.
**Workaround**: Decode real URLs from `uddg`. Extract the `vqd` token before calling image endpoints. All scrape failures must degrade gracefully to ungrounded fallback rather than throwing fatal exceptions. Provide mock/stub hooks so test suites never make real network calls.
**Anchors**: `html.duckduckgo.com`, `vqd`.

## [web-02] 2026-09-01 SharedArrayBuffer Cross-Origin Isolation Mandate [Status: Verified] [Agent: manual]
**Symptom**: `ReferenceError: SharedArrayBuffer is not defined` or `window.crossOriginIsolated` is `false` in modern browsers.
**Cause**: Due to Spectre vulnerability mitigations, browsers completely disable `SharedArrayBuffer` and high-resolution timers unless the document is in a cross-origin isolated context.
**Workaround**: Configure web server / Vite dev server response headers:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
Verify `window.crossOriginIsolated === true` before initializing worker threads sharing memory buffers.
**Anchors**: `Cross-Origin-Opener-Policy`, `SharedArrayBuffer`.

## [web-03] 2026-09-22 React 19 RSC Module Boundary Serialization Traps [Status: Verified] [Agent: manual]
**Symptom**: Build or runtime error: `Functions cannot be passed directly to Client Components unless you explicitly expose it with "use server"`.
**Cause**: Passing non-serializable objects (classes with prototype methods, Symbols, cyclic graphs, unhandled Promises) across the React Server Component (RSC) to Client Component boundary.
**Workaround**: Only pass plain JSON-serializable objects, arrays, and primitives as props across RSC boundaries. Server actions must be explicitly annotated with `"use server"`.
**Anchors**: `RSC`, `"use client"`, `"use server"`.
