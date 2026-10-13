# Design Thinking

The universal thinking model. Apply to every change.

## Three Lenses

| Lens | Question | Catches |
|---|---|---|
| **Result** | What comes out when this works? | broken dataflow, wrong return shapes, missing terminal sinks |
| **Crack** | Where can this break? | unhandled errors, missing fallbacks, unchecked invariants |
| **Need** | What must exist for this to run? | hidden dependencies, missing preconditions |

### Result — think first
Map `Origin -> Transform -> Terminal Sink`. Define shapes and contracts upfront
(records, branded IDs, typed states, structured errors).

### Crack — think second
Classify each failure mode:
- **Transient** — retry / backoff recovers.
- **Recoverable** — an explicit fallback path exists.
- **Fatal** — invariant violated; halt or bubble a structured error.

### Need — think third
Declare prerequisites: connections, config, auth context, state preconditions.

## Hard Rules

1. **NO Escape Hatch** — take the path that fits the project's current
   condition, not the fastest / easiest. This includes a "best practice" that
   does not fit the context. LLMs default to the fastest path; this rule
   overrides that default.
2. **Functional Isolation** — use pure functions to isolate one thing from
   another so a change to one does not affect the other; any effect must be
   easily traced. Minimize side effects by design instead of over-analyzing them.
3. **NO Silent Failure** — no `return null` without a handler; no swallowed failure.
4. **NO Ambiguity** — an unanswered question becomes a guess; ask instead.
5. **NO Unnamed Symbols** — cite `symbol(shape) @ file:line` for existing code,
   `symbol(signature) @ destination` for new code.
6. **NO Stranded Data Flow** — every producer connects to an active consumer.
7. **NO Detached State Shadowing** — one authoritative owner per state; no
   detached shadow flags.

## Tier Scaling

- **Tier 0** (trivial, non-functional): Hard Rules only. Direct execution.
- **Tier 1** (isolated, ≤ 2 files): Hard Rules + Three Lenses on touched symbols.
- **Tier 2** (architectural, multi-file): Hard Rules + full Three Lenses + all
  `gates.md` gates.
