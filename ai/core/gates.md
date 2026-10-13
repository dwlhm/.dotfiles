# Gates

Pre-change checklist. Run only the gates proportional to the tier (see
`design-thinking.md` Tier Scaling). Before proposing or executing a change:

- **[Gate 0] Root Cause** — prove the target is the origin, not a downstream
  symptom, with `symbol @ file:line` evidence.
- **[Gate 0.5] Knowledge Confidence** — name the underlying concept, not the API;
  verify stack-specific behavior against canonical specs before acting.
- **[Gate 1] Constraint Enumeration** — list every constraint on the touched area
  (layout, lifecycle, state, concurrency, platform). Reject solutions that violate one.
- **[Gate 2] Impact & Prior-Fix Collision** — map callers, consumers, and side
  effects; list previously fixed bugs in the area and justify the change does not
  revert them.
- **[Gate 2b] Terminal Sink Trace** — trace every produced artifact to its
  authoritative sink (screen, socket, disk, syscall).
- **[Gate 3] Cross-Surface Ripple** — enumerate every surface that renders the
  touched state, shares its gestures, or reacts to its transitions; verify all
  stay consistent.

## Named Methodology Gate

When a task implements a named methodology, pattern, protocol, or algorithm
(CQRS, Saga, OAuth, Raft, ...), or an underspecified prompt requires
architectural discovery:

1. Name the canonical methodology explicitly.
2. Verify invariants against authoritative specs — never design from memory.
3. Extract non-negotiable invariants: components, ordering, boundaries, data flow.
4. Anchor the plan to those invariants; reject any plan that violates one.
5. Reconcile the data model with the render model (dimensionality must match).

## Citation

`symbol(shape) @ file:line` for existing symbols; `symbol(signature) @ destination`
for new symbols. Mandatory for codebase claims; optional in summaries. Unanchored
claims are hypotheses, not diagnoses.
