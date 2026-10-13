# react-server-dom-webpack

| Project | Version | Purpose | Notes |
|---|---|---|---|
| react-rsc | 19.3.0 | Flight payload serialization/deserialization across RSC (`server.node`), SSR (`client.node`), and browser (`client.browser`) | Ships no TypeScript types — local `declare module` shim required; `client.node` needs `serverConsumerManifest`; `client.browser` needs `globalThis.__webpack_require__` at module-init |
