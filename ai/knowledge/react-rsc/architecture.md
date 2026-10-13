# Architecture — react-rsc

## 2026-09-22 Current State

Thin declarative layer over React 19 RSC. No registration API, no manifest, no
tree-walk, no `'use client'`/`'use server'` directives. Two server processes plus
a browser bundle. Routes are defined ONCE in a shared Express router; the same
route returns HTML (first load) or a Flight payload (soft navigation), selected
by the `x-rsc` header.

### Entry Points

| Method | Entry | Port | Node Conditions | Key APIs |
|---|---|---|---|---|
| RSC | `src/rsc/entry.tsx` | 3001 | `node --conditions react-server` (MANDATORY) | `react-server-dom-webpack/server.node` → `renderToPipeableStream` |
| SSR | `src/server/entry.tsx` | 3000 | Normal Node conditions | `react-server-dom-webpack/client.node` → `createFromReadableStream`, `react-dom/server` → `renderToReadableStream` |
| Browser | `src/client/entry.tsx` → `public/assets/client.js` | — | — | `react-server-dom-webpack/client.browser` → `createFromReadableStream`, `createFromFetch`, `react-dom/client` → `hydrateRoot` |

### Layer Map

| Layer | Path | Responsibility |
|---|---|---|
| Runtime | `src/runtime/` | `page(render,{cache})` + `configurePageRuntime` (`page.ts`); `clientRef` + `setClientReferenceFactory` (`client-ref.ts`) |
| Shared routes | `src/app/pages.tsx` | ONE Express router (`pagesRouter`) imported by BOTH processes; `page(...)` handlers with per-path cache strategy |
| RSC server | `src/rsc/` | `page-runtime.ts` (Flight render + per-path cache), `render.tsx`, `reference-resolver.ts`, `client-refs.tsx`, `cache.ts` |
| SSR server | `src/server/` | `page-runtime.ts` (nonce validation + document/proxy), `ssr.tsx`, `document.ts`, `client-registry.ts` |
| Browser client | `src/client/` | `start.ts` (hydrate `<Root>`), `root.tsx` (tree state), `navigation.ts` (soft-nav), `registry.ts`, `globals.ts`, `components/AppShell.tsx` (shell) |
| Shared | `src/shared/` | HTTP errors, production guard, `session/nonce.ts` |
| Build | `vite.*.config.ts` | TS/JSX transform + bundling only |

### Data Flow

```
First load:  GET / (no x-rsc) -> SSR 3000
  |  fetch RSC 3001 / -> Flight payload (cache per path)
  |    tee: branch A -> client.node.createFromReadableStream -> renderToReadableStream -> HTML
  |         branch B -> accumulate -> embed at tail as __RSC_PAYLOAD__
  |  document: head + streamed HTML + <script>__RSC_NONCE__</script> + <script>__RSC_PAYLOAD__</script> + client.js
  |    browser hydrate <Root initialTree>, installNavigation

Soft nav:  click <a href="/about"> -> installNavigation (delegated)
  |  fetch /about { x-rsc: <nonce> } -> SSR validates nonce vs rsc_nonce cookie
  |    streams RSC /about payload -> createFromFetch -> setState
  |      React reconciliation keeps the shared shell DOM (same type + position);
  |      the shell is a client component, so <nav> markup is NOT in the payload
```

### Key Patterns

- **Thin runtime injection**: `page()` delegates to a `PageRuntime` configured per process (`configurePageRuntime`). The shared route module never imports process-specific modules.
- **Client refs without `server.node` in the SSR graph**: server components reference client components through `clientRef(moduleId)` (`src/runtime/client-ref.ts`), a lazy wrapper that resolves `setClientReferenceFactory(...)` at render time. Only the RSC entry injects `createClientModuleProxy`.
- **Manifest-free reference resolution**: `createReferenceResolver()` (`src/rsc/reference-resolver.ts`) — self-describing `Proxy`, key `path#export` → `{ id, chunks: [], name }`.
- **Per-path cache**: `src/rsc/cache.ts` `lookup`/`store`; `"static"` (forever), `{ revalidate: n }` (TTL), `"dynamic"`/undefined (no cache).
- **Stream on miss, buffer on hit**: `src/rsc/page-runtime.ts` streams the Flight payload while accumulating it for the cache; cache hits send the buffered string.
- **`x-rsc` nonce**: `src/shared/session/nonce.ts`; generated on first load, set as `rsc_nonce` cookie, embedded as `__RSC_NONCE__`; navigation sends it in `x-rsc`; invalid → 403; absent → document.
- **Express 5 modular routing**: `pagesRouter` shared; `/healthz` on both; `/assets` static; centralized error handler + `notFoundHandler`.
- **Shell is a client component**: `AppShell` (`src/client/components/AppShell.tsx`) is a client module referenced by routes via `clientRef`; navigation Flight payloads carry only a client-reference row + the page subtree, never the `<nav>` markup. The per-path cache therefore stores no duplicated shell. See ADR-009.

### Caching

| Strategy | Behavior |
|---|---|
| `"static"` | cache forever (until process restart) |
| `{ revalidate: n }` | cache for `n` seconds |
| `"dynamic"` / omitted | never cache; always stream |

Cache applies to path & RSC (server-rendered) content. Client components are bundled and never cached.
