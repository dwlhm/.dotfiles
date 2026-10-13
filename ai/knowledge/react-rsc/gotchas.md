# Gotchas — react-rsc

## 2026-09-22 React `react-server` build has no `createContext`/`useContext`

**Symptom**: Using `createContext`/`useContext` in a module bundled under `--conditions react-server` aborts the RSC bundle.
**Cause**: Under the `react-server` condition React exports only a subset; `createContext` and `useContext` are `undefined` (only `use` exists). Verified: `node --conditions react-server -e "import('react').then(m=>console.log(typeof m.createContext))"` -> `undefined`.
**Workaround**: Do not rely on React context in server-side runtime code.
**Files**: `src/runtime/`.

## 2026-09-22 `server.node` must not enter the SSR import graph

**Symptom**: SSR process throws "The 'react' package in this environment is not configured correctly. The 'react-server' condition must be enabled".
**Cause**: `react-server-dom-webpack/server.node` requires the `react-server` condition; any module imported by the SSR process that imports it will throw.
**Workaround**: Reference client components through `clientRef` + an injected factory (`setClientReferenceFactory`), injected only by the RSC entry.
**Files**: `src/runtime/client-ref.ts`, `src/rsc/entry.tsx`, `src/rsc/client-refs.tsx`.

## 2026-09-22 Buffering the RSC payload kills progressive SSR

**Symptom**: Suspense fallback is never streamed; resolved content appears directly.
**Cause**: If SSR receives a fully buffered payload (`response.text()`), React's client deserializer resolves the Suspense boundary immediately, so `renderToReadableStream` has nothing to defer.
**Workaround**: Fetch and tee the LIVE RSC response body; feed one branch to `createFromReadableStream` and accumulate the other for embedding.
**Files**: `src/server/page-runtime.ts`, `src/server/ssr.tsx`.

## 2026-09-22 Cache + streaming: stream on miss, buffer on hit

**Symptom**: Caching a path makes it stop streaming.
**Cause**: A cached payload is complete, so its Suspense boundaries are already resolved.
**Workaround**: On cache miss, pipe the Flight stream through a `PassThrough` that both writes to `res` and accumulates chunks; store after `end`. On hit, send the string. Test progressive streaming on a `dynamic` path (e.g. `/stream`), not a cached one.
**Files**: `src/rsc/page-runtime.ts`, `src/rsc/cache.ts`.

## 2026-09-22 Invalid `x-rsc` returns 403, absent returns the document

**Symptom**: A request with a wrong `x-rsc` does not return the HTML document.
**Cause**: `createSsrPageRuntime` rejects any present-but-invalid nonce with `HttpError(403)`; only an absent header serves the document.
**Workaround**: Expect 403 for a present invalid nonce; omit `x-rsc` to get HTML.
**Files**: `src/server/page-runtime.ts`, `src/shared/session/nonce.ts`.

## 2026-09-22 jsdom needs a fetch/cookie shim for soft-navigation tests

**Symptom**: In jsdom, client-side navigation falls back to `location.assign` and the test fails.
**Cause**: jsdom implements no `fetch` and no cookie jar, so the navigation request has no `rsc_nonce` cookie.
**Workaround**: In `beforeParse`, wrap `window.fetch` to inject `cookie: rsc_nonce=<__RSC_NONCE__>` when absent; also polyfill web streams/Response.
**Files**: `scripts/smoke.mjs`.

## 2026-09-21 React error #504 — dev/prod Flight payload mismatch

**Symptom**: Hydration fails with React error #504.
**Cause**: Production-built client bundle + development React server produce incompatible Flight payloads.
**Workaround**: Build and run the whole pipeline under the same React build mode (production).
**Files**: `scripts/build*`, client bundle `public/assets/client.js`, `src/rsc/entry.tsx`.

## 2026-09-21 NODE_ENV cannot be auto-defaulted inside the entry

**Symptom**: Attempts to set `NODE_ENV` from inside `entry` fail to affect React's dev/prod choice.
**Cause**: Built `dist/*/entry.mjs` is a single bundled ESM file whose external `import * as react from "react"` is HOISTED above all body code; React picks dev/prod at import time. A prelude module or a Rollup banner fails for the same reason (imports always hoist).
**Workaround**: Fail-fast guard `assertProductionRuntime()` in `src/shared/runtime/assert-production.ts`, called at the top of each entry body.
**Files**: `src/shared/runtime/assert-production.ts`, `dist/*/entry.mjs`.

## 2026-09-21 Browser client requires `__webpack_require__` before module evaluation

**Symptom**: `react-server-dom-webpack/client.browser` throws / misbehaves on load.
**Cause**: It requires `globalThis.__webpack_require__` (with a `.u` property) and `globalThis.__webpack_chunk_load__` to EXIST BEFORE the module is evaluated; it reads `__webpack_require__.u` at module-init.
**Workaround**: Import ordering + an inline HTML shim that defines both globals before the client bundle runs.
**Files**: `src/client/entry.tsx`, SSR HTML generator in `src/server/`.

## 2026-09-21 `client.node` requires a full `serverConsumerManifest`

**Symptom**: Node RSC client errors when deserializing the Flight payload.
**Cause**: `react-server-dom-webpack/client.node` requires `options.serverConsumerManifest.{moduleMap,serverModuleMap,moduleLoading}`.
**Workaround**: Pass `moduleMap: null` so it uses the `[id, chunks, name]` metadata directly via `__webpack_require__`.
**Files**: `src/server/entry.tsx`.

## 2026-09-21 Client reference shape

**Symptom**: Boundary references are not recognized as client components.
**Cause**: `registerClientReference` / `createClientModuleProxy` emit `{ $$typeof: Symbol.for('react.client.reference'), $$id: "path#export" }`; anything else is not a client reference.
**Workaround**: Produce boundaries only through these APIs (`src/rsc/client-refs.tsx`).
**Files**: `src/rsc/client-refs.tsx`.

## 2026-09-21 jsdom needs stream/Response polyfills

**Symptom**: jsdom test cannot execute the React RSC browser runtime.
**Cause**: jsdom lacks the web streams/encoding globals React depends on.
**Workaround**: Polyfill `Response`, `ReadableStream`, `WritableStream`, `TransformStream`, `TextDecoderStream`, `TextEncoder`, `TextDecoder`.
**Files**: smoke/verify scripts (`scripts/smoke.mjs`, `scripts/verify-pipeline.mjs`).

## 2026-09-21 `react-server-dom-webpack` ships no TypeScript types

**Symptom**: `tsc --noEmit` fails to resolve the package's types.
**Cause**: The package ships no TypeScript type declarations.
**Workaround**: A local `declare module` shim is required.
**Files**: type shim file consumed by `tsconfig.json`.

## 2026-09-21 Express 5 wildcard syntax

**Symptom**: Route registration throws / does not match.
**Cause**: In Express 5 a bare `*` is invalid; and path semantics differ inside a mounted router.
**Workaround**: Use `"/{*path}"`. Inside a router mounted at `/rsc`, `req.path` is mount-relative (e.g. `/about`) and `req.params.path` is an array of segments. Regex routes (`/^\/(.*)$/`) also work.
**Files**: `src/rsc/app.ts`, `src/server/routes/page.route.tsx`.

## 2026-09-21 Express 5 catch-all page route bypasses `notFoundHandler()` for GET

**Symptom**: Unknown GET paths do not hit `notFoundHandler()`.
**Cause**: `app.use("/", router)` with `get("/{*path}")` matches every GET, so `notFoundHandler()` is bypassed for GET.
**Workaround**: Unknown GET paths 404 via the RSC route lookup → `HttpError(404)` → centralized error handler. `notFoundHandler()` still covers non-GET methods.
**Files**: `src/server/app.ts`, `src/shared/http/error-handler.ts`, `src/app/routes/index.ts`.

## 2026-09-21 Streaming RSC payload renders Suspense progressively

**Symptom**: Need to confirm SSR streams fallbacks then resolved content rather than buffering.
**Cause**: `response.body.tee()` feeds one branch to `client.node.createFromReadableStream` and accumulates the other for embedding.
**Workaround**: Expect Suspense fallbacks first and resolved content later; verified with timings (fallback ~t+1ms server, resolved ~t+398ms).
**Files**: `src/server/ssr.tsx`.

## 2026-09-21 Progressive SSR still waits for the full payload before hydration

**Symptom**: Streaming improved TTFB/initial content but browser hydration is not earlier.
**Cause**: The Flight payload is embedded only at the document tail (after SSR completes), so the browser cannot hydrate until the full payload arrives.
**Workaround**: Treat streaming here as a TTFB/initial-content win only; do not expect earlier hydration.
**Files**: `src/server/document.ts`, `src/server/ssr.tsx`.

## 2026-09-21 Errors after `pipe(res)` has started cannot change HTTP status

**Symptom**: A failure mid-stream yields a truncated/incomplete response rather than a 5xx.
**Cause**: Once `pipe(res)` has started, response headers/status are already committed.
**Workaround**: Only the stream can be destroyed; ensure pre-stream failures (route lookup, fetch) throw before piping.
**Files**: `src/server/ssr.tsx`, `src/shared/http/error-handler.ts`.

## 2026-09-23 Server-component shell re-serializes on every navigation

**Symptom**: The `<nav>`/layout markup appears in every route's Flight payload and in every per-path cache entry, even though React preserves the shell DOM across soft navigation.
**Cause**: A server-component layout rendered by each route (`page(() => <App><Page/></App>)`) is re-serialized per route; the thin layer has no layout-sharing/segment mechanism.
**Workaround**: Make the shell a client component referenced via `clientRef` (`AppShell`), so RSC emits only a client reference + the page subtree. If the shell ever needs server-only data, a segment-keyed partial payload + client splice is required instead (NOT implemented).
**Files**: `src/client/components/AppShell.tsx`, `src/rsc/client-refs.tsx`, `src/app/pages.tsx`.
