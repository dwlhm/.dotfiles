# Methodology Verification Protocol

Whenever a task requires implementing a **named methodology, pattern, protocol,
standard, or algorithm**, the orchestrator MUST extract and verify that methodology's
structural invariants before producing any design.

## What counts as a named methodology

Any of the following trigger this protocol:
- Architectural patterns: CQRS, Event Sourcing, Saga, Clean Architecture, Hexagonal
- Communication protocols: OAuth 2.0, WebSocket, MQTT, gRPC
- Algorithms: consistent hashing, B-tree, RAFT consensus, Bloom filter
- Process methodologies: BDD, TDD, DDD, Kanban
- AI/ML architectures: ReAct, Tree of Thoughts, Self-Refine, LoRA, RAG
- Any other named pattern the user or task mentions by name

If the user names it, verify it before designing.

## Required steps

1. **Name the methodology explicitly** — write it out, do not paraphrase.
2. **Source the definition** — canonical paper, RFC, specification, or reference
   implementation. Do NOT rely on training knowledge alone for structural details.
3. **Extract the invariants** — the structural properties that MUST hold for an
   implementation to correctly instantiate the methodology:
   - What are the required components/phases/steps?
   - What is the ordering constraint between them?
   - What may NOT be combined into a single step?
   - What data flows where, and what must NOT flow where?
   - What defines a valid terminal state?
4. **State the invariants in the plan** — before writing any function signatures,
   data types, or file layouts.
5. **Gate the design** — if the proposed design violates any invariant, it does not
   implement the named methodology. Revise before approval.

## Red flags — you are designing from intuition, not from the methodology

- A single component handles responsibilities that the methodology assigns to
  separate components.
- Data flows in a direction the methodology prohibits (e.g., child receives parent
  context when the methodology requires isolation).
- The "termination condition" is vague prose rather than a deterministic structural
  property.
- The design could be described more accurately by a simpler pattern (e.g., a loop)
  than by the named methodology.

If any red flag is present, stop. Source the definition. Re-extract the invariants.

## When the methodology is unfamiliar

If the methodology is not immediately known in detail:
- Research it before the Phase 1 call graph.
- Use a subagent if the research is extensive.
- Do not produce a plan until the invariants are confirmed from a primary source.

Designing from a partial understanding of a methodology is equivalent to designing
from no understanding — the gaps will be filled with intuition, producing a design
that looks correct but violates the invariants the methodology was designed to enforce.
