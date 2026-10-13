---
name: ui-ux-interaction-reasoning
description: >-
  Adaptive reasoning framework for UI/UX interaction decisions. Derives
  interaction patterns, state behavior, density, async feedback,
  accessibility, responsive adaptation, and implementation constraints from
  the actual task rather than memorized UI conventions. Uses proportional
  rigor: lightweight reasoning for simple components and deeper analysis for
  structural, consequential, or ambiguous flows.
---

# UI/UX Interaction Reasoning

## §0. Core Principle & Governance

Patterns are outputs, constraints are inputs. Never start from dogmatic conventions:
- "Edit -> drawer" (dogma) vs. "3 inline fields with continuous canvas reference -> inline form" (derived)
- "Delete -> modal" (dogma) vs. "Reversible soft-delete with undo toast -> immediate optimistic removal" (derived)
- "Mobile -> bottom sheet" (dogma) vs. "Intermittent reference lookup -> inline accordion" (derived)
- "Async -> full-screen spinner" (dogma) vs. "High-confidence write -> pending-but-interactive row" (derived)

> **Anti-Drift Governance Rule**: UI reasoning depth (Fast Track, Standard Track, Full Pipeline) dictates analysis rigor only. It NEVER bypasses the Orchestrator's Step 5 YES/NO confirmation gate or authorizes autonomous code mutations. All file modifications remain strictly subject to Step 5 approval and delegation.

---

## §1. Reasoning Depth Selection

Choose reasoning depth before analyzing:

| Track | Trigger Criteria | Required Analysis |
|---|---|---|
| **Fast Track** | Isolated micro-components, pure styling/tokens, static presentation, zero async side-effects, trivial consequence. | Target size, contrast check, token lookup, micro plain-text flow. |
| **Standard Track** | Single-view workflows, form submissions, modest state changes, standard reversible mutations. | Context dependency, effect & reversibility, surface selection, MECE states, optimistic UI rules. |
| **Full Pipeline** | Multi-surface navigation, irreversible mutations, cross-device workflows, high cognitive branching, custom gestures. | All 25 principles, explicit hard elimination matrix, MECE state table, accessibility invariants. |

---

## §2. Escalation Rule

Start at the lowest justifiable depth. Escalate immediately from Fast/Standard to Full Pipeline if discovery reveals any of:
1. Action proves irreversible or compensatable rather than reversible.
2. Mutation modifies shared global or persistent remote state.
3. Flow requires non-modal to modal focus trapping or focus restoration.
4. Layout changes cause context loss across breakpoints.

---

## §3. Motor Cost & Target Size

Physical interaction effort follows target geometry, distance, and precision (Fitts's Law):
- Minimum interactive bounding box: `~44x44` CSS px (or platform equivalent: `48dp` Android, `44pt` iOS).
- Tap targets with high motor cost (e.g. corners, dense lists) require expanded hit slop or spacing.
- **Unverified Geometry Rule**: If element bounding box, padding, or touch geometry cannot be verified from inspectable styles or static code:
  `target_size = UNVERIFIED`
  Never assume or guess compliance without computed dimensions.

---

## §4. Decision Cost

Cognitive effort increases with choice count and branching ambiguity (Hick's Law):
- Minimize concurrent primary choices per view (aim for 1 primary action per surface).
- Group secondary choices behind progressive disclosure.
- Provide sensible defaults for high-frequency workflows.

---

## §5. Context Dependency

Measure how much surrounding data the user must view during the interaction:

| Level | Definition | Surface Implication |
|---|---|---|
| `none` | Action is completely self-contained. | Modal, dedicated page, or dialog permitted. |
| `recall` | User acts on memory of preceding state. | Sheet, drawer, or modal acceptable. |
| `intermittent` | User occasionally glances back at canvas. | Popover, anchored card, or side drawer. |
| `continuous` | User MUST continuously reference underlying data. | **Hard Constraint**: NEVER use modal or full-screen overlay. Inline or docked non-modal panel ONLY. |

---

## §6. Effect Scope & Reversibility

Analyze the fallout of the interaction:

### Effect Scope
- `local`: In-memory component state; lost on reload.
- `internal`: Persisted to local database/storage; system-contained.
- `external`: Dispatched to remote API, webhooks, financial network, or physical hardware.

### Reversibility
- `reversible`: Immediate undo without penalty (e.g. text edit, undo stack).
- `recoverable`: Soft-deletion with trash bin, draft recovery, or archive.
- `compensatable`: Cannot be undone directly; requires a distinct reversing transaction (e.g. refunding a payment, cancelling a booking). *Note*: Compensation != Reversal (incurs operational and cognitive overhead).
- `irreversible`: Permanent destruction, cryptographic signing, hardware flash.

---

## §7. Consequence & Friction Matching

Friction must match `Consequence × Irreversibility`, NEVER merely the action verb:

| Consequence | Reversibility | Required Friction | Mechanism |
|---|---|---|---|
| Trivial | Reversible | Zero friction | Immediate execution, inline feedback |
| Moderate | Recoverable | Minimal friction | Optimistic execution + undo banner / snackbar |
| High | Compensatable | Deliberate friction | Explicit confirmation prompt or two-step review |
| Critical | Irreversible | High friction | Typed confirmation, destructive warning, distinct step |

*Anti-pattern*: Placing a blocking confirmation modal on a soft-delete item with a 30-day recycle bin.

---

## §8. Surface Selection & Hard Elimination

Select the interaction surface using elimination:

| Surface | Best Used For |
|---|---|
| `inline` | In-place edits, zero spatial disruption, continuous context workflows. |
| `popover` | Anchored contextual edits, small option lists, intermittent context. |
| `modal` | Self-contained, high-consequence decisions, zero context dependency. |
| `non-modal panel` | Multi-field editing requiring continuous reference to the main canvas. |
| `drawer / sheet` | Mobile secondary flows, medium-depth forms preserving partial context. |
| `page` | Complex multi-step creation workflows, dedicated deep tasks. |
| `full-screen modal` | Immersive authoring, distraction-free configuration. |

### Hard Elimination Rules
1. Continuous reference required -> **ELIMINATE** Modal & Full-screen overlay.
2. Local complexity exceeds 5 fields or multi-step logic -> **ELIMINATE** Tooltip & small Popover.
3. Action is low consequence & reversible -> **ELIMINATE** Blocking Modal.
4. Viewport constraint: If a drawer or non-modal panel covers `>= 85%` of the viewport width/height, issue a warning and treat interaction as a modal or full page.
5. Incomplete focus trap / return -> **ELIMINATE** Overlay surfaces until lifecycle is specified.

---

## §9. Tie-Breaking Hierarchy

When interaction constraints conflict, break ties in strict descending order:
1. **Context Continuity** (preserving working mental state & reference data)
2. **Error Prevention & Consequence Mitigation** (preventing irreversible mistakes)
3. **Accessibility** (focus restoration, keyboard parity, screen reader parity)
4. **Cognitive Load** (reducing decision branches and choice overload)
5. **Motor Cost** (minimizing precision burden and travel distance)
6. **Visual Hierarchy** (clarity of scanning and focal points)
7. **Aesthetic Preference** (visual styling elegance)

---

## §10. State Design (MECE State Table Alignment)

Every interactive surface must map to a Mutually Exclusive, Collectively Exhaustive (MECE) state matrix across three orthogonal axes:

- **Data States**: `loading` -> `loaded` -> `empty` -> `error` -> `stale`
- **Query States**: `unfiltered` -> `results` -> `zero-results`
- **Mutation States**: `idle` -> `pending` -> `success` -> `failure`

No state combination can fall through without a defined visual representation and user recovery path.

---

## §11. Optimistic UI & Perceived Performance

Design asynchronous behavior by predictable safety:

- **11.1 Optimistic Update**: Apply when mutation success rate is near 100% AND action is reversible or recoverable. Mutate UI instantly, dispatch network call in background, roll back with clear error notification on failure.
- **11.2 Pending-but-Interactive**: Show subtle in-flight indicator (reduced opacity, inline pulse) on the mutating item while leaving the remainder of the UI fully interactive. Never freeze unrelated controls.
- **11.3 Blocking State**: Strictly reserved for critical/financial transactions or where concurrent edits cause state corruption. Lock ONLY the affected form or record, never the whole viewport.
- **11.4 Duplicate Mutation Prevention**: Prevent duplicate submissions via idempotency keys, disabling trigger buttons upon first click, or debouncing rapid inputs.
- **11.5 Stale Response Protection**: Guard against out-of-order responses using `AbortController`, monotonic request IDs, or sequence counters. Superseded responses must be discarded silently.

---

## §12. Existing Design System First

Never introduce ad-hoc styles when system tokens exist:
- Inspect existing theme variables, spacing tokens, and typography scales before writing CSS.
- Map every layout dimension to a recognized token.

---

## §13. Component Reuse Rule

Always follow this precedence ladder:
`existing component` -> `variant of existing component` -> `composition of existing components` -> `extension of existing component` -> `new primitive` (last resort; requires architectural justification).

---

## §14. Token Reasoning

- Spacing, colors, elevations, and type sizes must be referenced semantically (e.g. `var(--spacing-md)`, `theme.color.surface.warning`).
- Never introduce raw hex values or arbitrary pixel numbers into component code.

---

## §15. Visual Density

- **Information density != Control density**.
- High information density (dense data tables, terminal output, telemetry) is acceptable and efficient when structured clearly.
- High control density (clusters of buttons, toggles, dropdowns) increases cognitive friction. Group controls, hide secondary actions, and preserve white space around interactive targets.

---

## §16. Materiality

- Visual effects (elevations, shadows, frosted glass, borders) must serve informational hierarchy and spatial depth.
- Never add decorative borders or shadows that do not indicate interactive affordance, elevation layer, or container boundary.

---

## §17. Rendering Cost

- Optimize for device performance tiers.
- Avoid expensive CSS filters (nested `backdrop-filter: blur()`, multi-layered box-shadows, complex SVG filters) on scrollable views or mobile viewports.
- Animate only GPU-accelerated properties: `transform` and `opacity`.

---

## §18. Accessibility Invariants

Non-negotiable structural requirements:
- **Focus Restoration**: Closing an overlay/drawer/modal MUST restore focus to the trigger element that opened it.
- **Keyboard Parity**: Every pointer interaction must have a complete keyboard equivalent (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, arrow keys).
- **WCAG Contrast**: Text-to-background contrast must meet WCAG 2.1 AA (`4.5:1` normal text, `3:1` large text/interactive components).
  - *Strict Rule*: If contrast cannot be mathematically verified from static tokens: `contrast = UNVERIFIED`.
- **Target Size**: Minimum touch target `~44x44` CSS px. If unmeasured: `target_size = UNVERIFIED`.
- **Dynamic Live Regions**: Async updates must declare `aria-live="polite"` for non-critical status updates, and `aria-live="assertive"` solely for urgent errors.

---

## §19. Responsive Reasoning

Responsive adaptation requires recomputing constraints, not just resizing elements:
- Mouse ergonomics (high precision, hover state) change to touch ergonomics (low precision, no hover, high motor cost).
- Lost context mitigation: When multi-column desktop layouts collapse to single-column mobile views, maintain user position, offer inline previews, and preserve back-navigation history.

---

## §20. Conditional Reasoning Triggers

Invoke interaction reasoning whenever:
1. Adding or altering a modal, drawer, sheet, dialog, or popover.
2. Introducing an async mutation, data save, or network request.
3. Modifying tables, lists, selection models, or master-detail navigation.
4. Altering focus management, keyboard handlers, or validation triggers.

---

## §21. Unknown Policy

- A valid, rigorous result of inspection is `unknown` or `UNVERIFIED`.
- Never fabricate compliance metrics. If runtime dimensions, computed colors, or parent viewport contexts cannot be verified statically, explicitly label them:
  `contrast = UNVERIFIED` or `target_size = UNVERIFIED`.

---

## §22. Output Style

Format interaction reasoning using rigid markdown templates.

### Template: Micro Interaction
```markdown
### Interaction Blueprint: [Component Name]
- **Track**: Fast Track
- **Motor / Target**: [Target size | target_size = UNVERIFIED]
- **Contrast**: [Ratio | contrast = UNVERIFIED]
- **State Flow**:
  Idle ──[Click]──→ Active ──[Complete]──→ Idle
    │                 │
    Crack: Blur       Crack: Timeout
    Need: Focus       Need: Timer
```

### Template: Implementation-Heavy Flow
```markdown
### Interaction Blueprint: [Feature Name]
- **Track**: Standard Track
- **Context Dependency**: [none | recall | intermittent | continuous]
- **Effect & Reversibility**: [local/internal/external] × [reversible/recoverable/compensatable/irreversible]
- **Surface Selected**: [inline | popover | modal | panel | drawer | page]
- **Hard Elimination**: [Surfaces eliminated and why]
- **Async Pattern**: [Optimistic | Pending-but-Interactive | Blocking]
- **State Flow**:
  Idle ──[Submit]──→ Pending ──[Response]──→ Success
    │                  │                       │
    Crack: Invalid     Crack: NetworkError     Crack: StaleData
    Need: Validation   Need: AbortController   Need: CacheInvalidation
```

### Template: Complex Flow
```markdown
### Interaction Blueprint: [Feature Name]
- **Track**: Full Pipeline
- **Reasoning Matrix**:
  - Context Dependency: [Rating & rationale]
  - Consequence & Friction: [Rating & rationale]
  - Surface Selection: [Elimination ledger]
  - Tie-Breaker Applied: [Hierarchy level applied]
- **MECE State Matrix**:
  | State Axis | Variants Handled | UI Representation |
  |---|---|---|
  | Data | loading, loaded, empty, error, stale | [...] |
  | Query | unfiltered, results, zero-results | [...] |
  | Mutation | idle, pending, success, failure | [...] |
- **A11y Invariants**:
  - Focus Return: [Target element]
  - Keyboard Navigation: [Key mappings]
  - Metrics: target_size = [size | UNVERIFIED], contrast = [ratio | UNVERIFIED]
- **State Flow**:
  View ──[Action]──→ OptimisticUI ──[Resolve]──→ Synced
    │                  │                         │
    Crack: Unmounted   Crack: ServerReject       Crack: Collision
    Need: StateRef     Need: RollbackSnapshot    Need: Reconciliation
```

---

## §23. Examples of Proportional Rigor

### Example 1: Micro (Copy Button)
- **Track**: Fast Track
- **Target Size**: `44x44` px touch target via padding (`target_size = VERIFIED`).
- **Flow**: `Idle ──[Click]──→ Copied (2s tooltip) ──[Timer]──→ Idle`

### Example 2: Medium (Inline Table Row Rename)
- **Track**: Standard Track
- **Context Dependency**: Continuous (user needs adjacent row context).
- **Surface**: Inline input field (Eliminated: Modal, Drawer).
- **Async Pattern**: Optimistic update with pending badge; rollback on error.
- **Flow**: `Viewing ──[Double-Click]──→ Editing ──[Enter]──→ OptimisticSave ──[API 200]──→ Viewing`

### Example 3: High-Risk (Purge Customer Account)
- **Track**: Full Pipeline
- **Context Dependency**: None.
- **Consequence**: Critical × Irreversible.
- **Surface**: Dedicated Modal with typed account name verification.
- **A11y**: Focus trapped in modal; focus returned to trigger on cancel; assertive live region announcing deletion status.
- **Flow**: `Review ──[Initiate]──→ ConfirmationModal ──[Typed Match + Confirm]──→ BlockingPending ──[Complete]──→ LoggedOut`

---

## §24. Agent Guardrails & Anti-Patterns Table

| # | Dogma / Anti-Pattern | Required Engineering Correction |
|---|---|---|
| 1 | "Edit always opens a drawer/modal" | Derive surface from context dependency and field count. Prefer inline for small edits. |
| 2 | "Delete always opens a confirmation modal" | Derive friction from reversibility. Prefer soft delete + undo toast for recoverable actions. |
| 3 | "Mobile always uses bottom sheets" | Evaluate viewport density and context loss. Use accordion or inline expands when context is continuous. |
| 4 | "Async always blocks with a spinner" | Use optimistic updates or pending-but-interactive state whenever success rate is high. |
| 5 | "Form submission freezes the entire page" | Scope pending state to the submit button or form container; preserve surrounding UI interactivity. |
| 6 | "Responsive design means shrinking everything" | Recompute constraints: touch targets expand, continuous context reduces, keyboard shortcuts shift. |
| 7 | "Visual density means packing controls together" | Keep control density low while allowing information density to remain high. |
| 8 | "Decoration equals polish" | Every shadow, border, and elevation must serve informational hierarchy and spatial depth. |
| 9 | "Keyboard navigation can be added later" | Keyboard parity and focus restoration are architectural prerequisites. |
| 10 | "Assuming accessibility compliance without verification" | If contrast or target dimensions cannot be verified statically, output `UNVERIFIED`. |

---

## §25. Final Governing Rule

Use the minimum reasoning capable of preventing a bad decision. Do not produce verbose documentation for a trivial styling fix; never omit rigorous constraint mapping for stateful, consequential, or multi-surface flows.
