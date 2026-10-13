# Decisions — react-rsc

## 2026-09-23 ADR-009 Shell is a client component (no per-navigation re-serialization)

**Context**: `App` was a server component rendered by every route (`src/app/pages.tsx`), so the `<nav>` shell markup was serialized into every route's Flight payload and duplicated across every per-path cache entry. The thin layer has no layout-sharing mechanism.
**Decision**: The shell lives in a CLIENT component `AppShell` (`src/client/components/AppShell.tsx`), registered as a client module (`CLIENT_MODULE_IDS.AppShell`, `src/client/registry.ts`, `src/server/client-registry.ts`) and referenced by routes through `clientRef` (`src/rsc/client-refs.tsx`). `src/app/App.tsx` (server component) is deleted.
**Rationale**: RSC emits only a client-reference row plus the page subtree; the shell markup is produced on the client and by the SSR client registry, never serialized per navigation. Preserves ADR-001 (no directives/manifest) and ADR-008 (no `server.node` in the SSR graph).
**Consequences**: The shell cannot use server-only data. Server-owned layout persistence would require a segment-keyed partial payload plus a client splice (a router project), explicitly NOT implemented. React still invokes `AppShell` on each navigation (cheap); the shell DOM is preserved by reconciliation.

## 2026-09-22 ADR-005 Thin layer, no registration/manifest

**Context**: An earlier attempt introduced `registerComponent` + a runtime manifest built by tree-walking to discover component dependencies.
**Decision**: Drop registration, manifest, and tree-walk. Components are plain React components. Client-component dependencies come from the bundler import graph (static). `kind` (client/rsc/server/all-in-one) is only a label derived from which entry point bundles the component; it is not enforced at runtime.
**Rationale**: The registration layer added confusion without removing it, and leaned on build-time machinery the project wants to avoid.
**Consequences**: No runtime dependency graph; the server must not need one. Client component ids stay self-describing (module path).

## 2026-09-22 ADR-006 x-rsc header + per-session nonce for soft navigation

**Context**: After first load the browser must fetch a route as a Flight payload (to patch UI) instead of a full HTML document, without a full reload.
**Decision**: One shared Express route returns HTML when `x-rsc` is ABSENT (first load) and a Flight payload when PRESENT. The header value is a per-session nonce: generated on first load, stored in an `rsc_nonce` cookie and embedded in the document as `__RSC_NONCE__`; the server requires `x-rsc` === cookie. Invalid nonce → 403; absent → document.
**Rationale**: No second endpoint, no path duplication; the header doubles as a lightweight confirmation for payload access.
**Consequences**: The client must hydrate the nonce and send it on navigation; the document is not cacheable as-is (nonce varies), so only the Flight payload is cached.

## 2026-09-22 ADR-007 Per-path cache; stream on miss, buffer on hit

**Context**: Paths and RSC components rarely change; re-rendering every request wastes resources. Progressive SSR streaming must not be lost.
**Decision**: Cache the Flight payload per path with a strategy passed as an argument: `"static"`, `{ revalidate: n }`, or `"dynamic"`. On cache miss / dynamic, stream the payload while accumulating it for the cache. On cache hit, send the buffered payload. Client components are never cached.
**Rationale**: Caching needs the full payload; streaming needs the live stream. Splitting by cache state gives both: progressive for uncached/dynamic paths, fast replay for cached paths.
**Consequences**: Cached paths render from a complete payload, so their SSR has no Suspense fallback flush. `/stream` demonstrates a dynamic path where progressive streaming is observable.

## 2026-09-22 ADR-008 Lazy clientRef factory keeps server.node out of the SSR graph

**Context**: Routes are defined in ONE module imported by both processes. Server components reference client components, and the natural `createClientModuleProxy` call imports `react-server-dom-webpack/server.node`, which throws in the SSR process (needs the `react-server` condition).
**Decision**: Server components reference client components via `clientRef(moduleId)` — a lazy wrapper that calls an injected factory (`setClientReferenceFactory`) only WHEN RENDERED. Only the RSC entry injects `createClientModuleProxy`. SSR imports the shared route module but never renders server components, so it never needs the factory.
**Rationale**: Keeps a single shared route module while respecting the hard process boundary.
**Consequences**: An extra wrapper fiber per client reference; `clientRef` must be safe to call at module scope (it is — it only returns a component).

## 2026-09-21 ADR-001 No directives, no manifest

**Context**: React Server Components are conventionally wired with `'use client'`/`'use server'` directives compiled by a framework into a client manifest.
**Decision**: No `'use client'`/`'use server'` directives, no custom directive, no generated/hand-written manifest. Boundaries are expressed by calling low-level APIs directly; reference resolution is a self-describing `Proxy` (`createReferenceResolver()` in `src/rsc/reference-resolver.ts`).
**Rationale**: The user wants to assemble raw React low-level APIs, not adopt a framework.
**Consequences**: Boundary correctness is manual (file layout + entry points); mistakes surface only at runtime as payload/reference errors.

## 2026-09-21 ADR-002 RSC and SSR are separate Node processes

**Context**: `react-dom/server` and the RSC writer resolve to different React builds depending on the `react-server` resolution condition.
**Decision**: RSC and SSR MUST be separate Node processes with separate entry points (`src/rsc/entry.tsx` port 3001 vs `src/server/entry.tsx` port 3000).
**Rationale (verified)**: `react-dom/server` throws `"react-dom/server is not supported in React Server Components."` under the `react-server` condition; the RSC writer throws without it. The two requirement sets are mutually exclusive.
**Consequences**: Two processes to run/orchestrate; payload crosses a network/stream boundary between them.

## 2026-09-21 ADR-003 Express 5 for both server processes

**Context**: Need HTTP routing and error handling for both RSC and SSR processes.
**Decision**: Express 5 with a Router per concern and a centralized 4-arg error handler.
**Rationale**: Express 5 auto-forwards rejected promises from async handlers to error middleware, removing manual `try/catch` + `next(err)` plumbing.
**Consequences**: Error handling is centralized in error middleware (`src/shared/http/error-handler.ts`).

## 2026-09-21 ADR-004 Vite does not classify code

**Context**: Frameworks use Vite plugins to detect client/server boundaries via directives.
**Decision**: Vite's only role is TS/JSX transform + dependency bundling. Classification of RSC/SSR/browser code is manual via file layout and entry points.
**Rationale**: Keeps Vite generic and the boundary model explicit (see ADR-001).
**Consequences**: New modules must be placed in the correct directory and wired into the correct entry/registry by hand.
