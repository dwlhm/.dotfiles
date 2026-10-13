# Meta Heuristics & Harness Intelligence

Cross-agent operational heuristics, model capability matrices, and token preservation strategies across Antigravity, Codex, OpenCode, and Pi.

---

## Harness Capability Matrix

| Harness | Primary Model | Subagent Mechanism | Token Bottleneck | Ideal Delegation Scope |
|---|---|---|---|---|
| **Antigravity** | Gemini Flash / Pro | Native subagents (`implementer`, `architect`) | Context expansion on multi-file reads | Orchestration, high-context planning, subagent execution |
| **Codex** | GPT-5 / o-series | `spawn_agent` / dispatch | Prompt overhead from system rules | Deep algorithmic reasoning, refactoring isolated modules |
| **OpenCode** | deepseek-v4-flash | `task` tool | Large diff generation | Fast local terminal commands, targeted file edits |
| **Pi** | Local / RPC models | `subagent` extension | Context window limits | Single-responsibility units, isolated scripts |

> [!WARNING] This matrix is stale for the opencode adapter — verify current model and token behavior before relying on it. Model shown reflects the last-known runtime.

---

## Token Optimization Tactics

1. **Surgical Knowledge Retrieval**:
   - Never dump entire `architecture.md` or `gotchas.md` files into the context window upfront.
   - Use `ai/scripts/kb` commands (`kb context`, `kb list`, `kb search`, `kb get`) to retrieve headline-indexed knowledge (< 100 tokens per entry).
2. **Batched Parallel Inspection**:
   - Formulate explicit file sets before reading. Read entire scopes in single parallel batches (maximum 2 inspection rounds) rather than piecemeal single-file queries.
3. **Dead Code vs Test Complexity**:
   - Before spending context or time isolating test race conditions or fixing complex observers, verify if the symbol is actually instantiated in production code. Deleting dead code is strictly better than fixing flaky tests for unused features.
4. **Single-Source Verification**:
   - Centralize verification in one script (`scripts/pipeline.sh` or `make pipeline`) to prevent drift across environments and conserve tokens during verification rounds.

---

## Reference vs Specification (Orchestration Heuristic)

A user prompt anchored to a product ("based on X", "seperti stock launcher") is a DOMAIN HINT, not a behavioral specification. The true specification is the canonical implementation of the underlying feature:
- Extract the canonical invariants of that feature (e.g. AOSP Launcher3 `CellLayout` = absolute grid of cells, persisted positions, no re-packing, empty cells reusable from all directions).
- Map those invariants onto the user's actual constraints (e.g. launcher stays list-based/1D globally, but the widget container renders 2D).
- Audit implementation fidelity BEFORE coding: data model AND render model must both honor the invariants. A 2D data model rendered through a 1D row-major pipeline is a structural violation that produces the exact failure modes reported by users (widgets stuck in rows, empty space unfillable, resize blocked where space looks free).

Anchor example: `launch` project — widget container 2D grid; the 2026-09-30 row-major `packWidgetsIntoRows` implementation is the anti-pattern.
