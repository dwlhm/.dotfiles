# Design Thinking

> The graph (see `language.md`) is the medium. Think fully before building
> anything: every angle, every crack, every dependency resolved before
> implementation begins.

```
PROBLEM
  → Alignment check (orchestration.md §0)              → confirm intent
  → "What are the shapes?"                             → define the domain language
  → "What comes out when it works?"                    → draw the happy path (Result)
  → "How often does it change vs how often accessed?"  → classify cardinality
  → "Is it one-shot, many, or time-bounded?"           → mark execution frequency
  → "Can it run concurrently? Safe to deduplicate?"    → mark concurrency
  → "Where can it crack?"                              → find every failure point (Crack)
  → "What does each step need?"                        → declare every dependency (Need)
  → "Where does untrusted data enter?"                 → Schema at boundaries
  → "What wraps steps without changing them?"          → behavior layers
  → "What resources need cleanup?"                     → scope lifecycle
  → "Can I swap Needs and the graph still works?"      → verify with test layers
  → "Does my code separate Result from Cracks?"        → happy path and crack layer distinct
  → Completeness gate: for each node, trace every input variant through the
    graph. Every variant exits as a defined Result or a defined Crack. Any
    variant falling through is a defect planted before a line of code exists.
  → PLAN                                               → the plan IS the graph, fully specified
  → CODE                                               → the code IS the plan, no deviation
```

The code must match the graph. If the plan has a gap, the implementer guesses —
and a guess is a quality defect. If the plan is ambiguous, update the plan; do
not pass it forward.

## Three Lenses

Every node in your graph is examined through three lenses:

| Lens | Question | What it catches |
|---|---|---|
| **Result** | What comes out when this works? | Missing data flow, wrong return shape |
| **Crack** | Where can this break? | Unhandled errors, unchecked invariants |
| **Need** | What must exist for this to run? | Hidden dependencies, implicit assumptions |

Skip any lens on any node and the design is incomplete. Do not proceed.

## 1. Name the Shapes

Define the domain language before drawing anything: **Records** (entities that
flow through the graph — a User, an Order), **IDs** (branded, constrained, never
a bare string), **Variants** (named state transitions — Pending/Active/Cancelled),
**Errors** (structured, tagged, carrying context — not strings).

For each shape, enumerate every state it can be in — a User is also
unauthenticated, suspended, deleted. Every state flows through the graph or is
explicitly rejected at the boundary. Unstated states are not non-existent states.

## 2. Think Result First

Map the happy path: `Step 1 → Step 2 → Step 3 → Result`. What goes in, what
transforms, what comes out. Draw it first; the code follows.

**When a methodology applies**: if the system implements a named pattern,
protocol, or methodology, the graph MUST derive from that methodology's
structural invariants — a graph that violates them does not implement it,
however plausible it looks. See `methodology-verification.md`.

## 3. Think Cardinality Third

Every node has a cardinality — how often it runs, how often its data changes.
Classify each node explicitly; the wrong strategy wastes resources or returns
stale data. Mark cardinality on the graph.

- **Read/change vs access**: rarely-changes + frequently-accessed → cache
  aggressively, invalidate on write; frequently-changes + frequently-accessed →
  memoize with short TTL, deduplicate concurrent reads; rarely-changes +
  rarely-accessed → lazy-load; frequently-changes + rarely-accessed → compute
  on demand, no pre-warm.
- **Execution frequency**: one-shot → direct execution (`Effect`-style); many →
  stream, subscription, or polling (`Stream`-style); time-bounded → TTL or
  lease, invalidated on clock.
- **Concurrency**: if a node can run in parallel, verify it is safe; deduplicate
  concurrent calls on the same key — one request in, N listeners out.

## 4. Think Cracks Fourth

Every crack is **Transient** (retry fixes it: timeout, rate limit, reset),
**Recoverable** (an alternative path exists: fallback, cached result, default),
or **Fatal** (assumptions violated — programmer bug, broken invariant). Cracks
are named values, not strings; at each one decide: retry, recover, or propagate.

Cracks must be exhaustive, not illustrative: list every way a node can fail,
including failures the example never reaches. If you cannot name all failure
modes without looking at the implementation, you do not understand the node —
do not write code for it.

## 5. Think Needs Fifth

Declare what each node requires to exist — a database connection, a config
value, an HTTP client. Needs are compile-time proof dependencies are satisfied;
a missing need surfaces before runtime.

## 6. Trust at the Boundary

Untrusted data enters via HTTP requests, file reads, environment variables,
user input, third-party API responses. Schema converts `unknown → trusted` at
the edges — define once, use everywhere. Parse only at the boundary; inside,
types guarantee shape.

## 7. Separate Result from Cracks Structurally

The happy path reads as a linear sequence with no inline error handling; the
crack layer wraps or follows it, catching, retrying, or transforming every
failure mode. If error handling lives inside the happy path, Result and Cracks
are tangled.

**Divergent strategies** — the one exception: when two nodes in the same happy
path need different crack handling, handle each node's cracks inline (the outer
layer cannot tell which node produced which error). Mark it explicitly; it must
be rare.

## 8. Swap Needs to Prove It

The graph shape does not change between production and tests — only the Needs.
If the graph cannot run with a test Need, the design has a hidden dependency.
If you must mock the world to test one node, the node does too much.

## Hard Rules

- **NO Escape Hatches**: silent failure, return-`null`-and-hope, TODOs,
  "we'll handle errors later" — these are deferred defects. Every crack is
  resolved in the graph; if you cannot resolve it, stop, think, ask.
- **NO Shortcuts**: no "this should never happen" without naming what happens
  if it does; no implicit dependencies or state transitions; no unvalidated
  input — Schema at every boundary.
- **NO Ambiguity**: every unanswered question becomes an implementer's guess,
  and the guess will be wrong. Ambiguity in the plan → update the plan.
