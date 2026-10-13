# Vocabulary — react-rsc

## Simple Terms

**Client Reference**: `{ $$typeof: react.client.reference, $$id: "path#export" }` produced by `registerClientReference` / `createClientModuleProxy`. → `src/rsc/client-refs.tsx`

**serverConsumerManifest**: The `{ moduleMap, serverModuleMap, moduleLoading }` options object required by the Node RSC client (`react-server-dom-webpack/client.node`). → `src/server/entry.tsx`

**Reference resolver**: The self-describing `Proxy` passed as `renderToPipeableStream`'s second argument; replaces the client manifest. → `src/rsc/reference-resolver.ts`

**react-server condition**: The `--conditions react-server` resolution condition that selects React's server build; mandatory for RSC. → `src/rsc/entry.tsx`

**Path component**: A plain JSX component returned by `page(...)` at an Express route; its id is the route path. → `src/app/pages.tsx`

**Page runtime**: The per-process `PageRuntime` injected via `configurePageRuntime`; decides document (SSR) vs Flight payload (RSC). → `src/runtime/page.ts`

**Kind**: A label for which entry point bundles a component (client / rsc / server / all-in-one). Not enforced at runtime. → `src/app/pages.tsx`

**AppShell**: The client-component shell (`div.app` + `nav`) referenced by routes via `clientRef`; keeps shell markup out of per-navigation Flight payloads. → `src/client/components/AppShell.tsx`

**clientRef**: Lazy client-reference wrapper that resolves an injected factory (`setClientReferenceFactory`) at render time; keeps `server.node` out of the SSR import graph. → `src/runtime/client-ref.ts`

## Design & Architecture Terms

### Flight payload

**What it is**: The RSC wire format streamed with content-type `text/x-component` and consumed by both SSR and the browser.

**Invariants**:
- Streamed as `text/x-component`.
- Rows are `N:...`; import rows are `I[id, chunks, name]`.
- When embedded in HTML as `globalThis.__RSC_PAYLOAD__`, `<` MUST be escaped to `\u003c`.

**Anti-Patterns**:
- Embedding raw `<` inside the inline `<script>` payload.
- Re-serializing on SSR instead of forwarding the SAME payload from RSC to the browser.

**Source**: `src/rsc/entry.tsx`, `src/server/entry.tsx`, `src/client/entry.tsx`

### Soft navigation

**What it is**: Client-side route change that fetches a Flight payload and patches the tree without a full document reload.

**Invariants**:
- The shared shell DOM is preserved by React reconciliation (same element type + position).
- The shell is a client component (`AppShell`), so navigation payloads carry only a client reference + page subtree, not shell markup.
- The navigation request carries `x-rsc` equal to the `rsc_nonce` cookie.
- The URL is updated with `history.pushState`.

**Anti-Patterns**:
- Performing a full document reload.
- Rendering the fetched payload into a detached/separate root.
- Serving the payload without nonce validation.

**Source**: `src/client/navigation.ts`, `src/server/page-runtime.ts`

### Per-path cache

**What it is**: Server-side cache of the rendered Flight payload keyed by path.

**Invariants**:
- Only server-rendered content (path & RSC) is cached; client components never are.
- The strategy is explicit: `"static"` | `{ revalidate: n }` | `"dynamic"`.
- A cache hit never re-renders.

**Anti-Patterns**:
- Caching client components.
- Caching dynamic data with no expiry.

**Source**: `src/rsc/cache.ts`
