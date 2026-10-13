# Work in Progress — react-rsc

## Active

- none

## Recently Completed

- [x] Shared shell as a client component (`AppShell` via `clientRef`): soft-navigation Flight payload no longer re-serializes `<nav>`; `src/app/App.tsx` removed; `verify` 12/12 (assertion 12 asserts no nav markup + AppShell ref in the `/about` payload) and `smoke` pass — completed 2026-09-23
- [x] Thin-layer architecture: shared `pages.tsx` router, `page()` + injected `PageRuntime`, `clientRef` lazy factory, `x-rsc` nonce soft navigation, per-path cache with stream-on-miss/buffer-on-hit — `pnpm typecheck/build/verify(11/11)/smoke` all pass; smoke asserts client-side nav patches content and preserves `<nav>` identity — completed 2026-09-22
- [x] Multi-route RSC (`ROUTE_COMPONENTS` + `resolveRoute`) and streaming SSR (`streamDocument` with `body.tee()`) — completed 2026-09-21
- [x] Bare-metal RSC pipeline complete and verified — completed 2026-09-21

## Next Ideas (Not Implemented)

- Server Actions (`encodeReply`/`decodeReply`/`createServerReference`)
- Dev-mode HMR
- Per-RSC-component caching granularity (currently per path)
