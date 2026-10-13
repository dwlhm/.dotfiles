# Architecture — Soca Compiler

**Soca** is an ahead-of-time (AOT) compiler written in **Odin** for the **Teras UI DSL**. It compiles declarative UI components written in Odin into native source code across three platforms: **Web (vanilla JS/DOM)**, **Android (Kotlin + Jetpack Compose)**, and **iOS (Swift + SwiftUI)**.

---

## 1. System Overview & Pipeline Flow

```
                      Odin Source Files (*.odin)
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │       Parser Pass 1       │
                    │ - Read files via AST      │
                    │ - Find @(ui_component)   │
                    │ - Scan proc bodies        │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │       Parser Pass 2       │
                    │ - Classify procs:         │
                    │   View, Handler, Key      │
                    │ - Hole splitting          │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │    IR Lowering & Arena    │
                    │ - Lower to `IR_Node`      │
                    │ - Parse `Expr_Tree`       │
                    │ - Purity & Type check     │
                    │ - Diagnostics TE0001..12  │
                    └─────────────┬─────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      ▼                           ▼                           ▼
┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│ Web Emitter  │            │Android Emitter│           │ iOS Emitter  │
│ - TPL strings│            │ - State class│            │ - Observable │
│ - DOM mutator│            │   mutableState│           │   Swift class│
│ - runtime.js │            │ - Compose UI │            │ - SwiftUI    │
└──────────────┘            └──────────────┘            └──────────────┘
```

---

## 2. Parser Architecture (`soca:parser`)

The parser is implemented using Odin's native standard library (`core:odin/parser`, `core:odin/ast`, `core:odin/tokenizer`). It avoids external parser generators or heavy dependencies.

### Two-Pass AST Walk
- **Pass 1 (Declaration Collection & Call-Site Scanning)**:
  - Iterates through top-level declarations (`file.decls`).
  - Detects component state structs marked with the `@(ui_component)` custom attribute (`ast.Attribute.elems`).
  - Records all procedure declarations and traverses their syntax trees (`proc_lit.body`) to record procedure names referenced as event handlers (`ui.on_click`, `ui.on_input`) or list key extractors (`key=`).
- **Pass 2 (Procedure Classification)**:
  - Classifies each procedure into:
    - `.View`: The rendering function describing the visual hierarchy.
    - `.Handler`: Mutation functions invoked on user interaction.
    - `.Key`: Stable string identity generator for dynamic list elements.
- **String Hole Splitting (`string_hole.odin`)**:
  - Interpolated string templates are split into static text segments and dynamic holes (`{expr}`). Empty holes trigger diagnostic `TE0010`.

---

## 3. Intermediate Representation (`soca:ir`)

### Tagged Union `IR_Node`
The in-memory AST is lowered into a clean, platform-agnostic tagged union:

```odin
IR_Node :: union {
    ^Element,        // HTML / Layout element (div, span, button, input)
    ^Static_Text,   // Constant text segment
    ^Dyn_Text,      // Dynamic expression text: ui.to_text(expr)
    ^Event,         // Event listener binding: ui.on_click(handler)
    ^If_Node,       // Conditional rendering block: ui.if_(cond, ...)
    ^For_Each,      // Keyed list iteration: ui.for_each(...)
    ^Component_Ref, // Child component mounting: ui.component(Child, &state)
    ^Attr_Node,     // Custom attribute: ui.disabled(expr)
}
```

### Bump-Pointer Arena Allocator (`arena.odin`)
- **Memory Strategy**: All IR nodes, expression trees, and cloned strings are allocated in a contiguous bump-pointer `Arena`.
- **Lifetime Boundary**: Exactly one compiler execution run. All nodes are destroyed / reclaimed via `arena_destroy(&arena)` or reset via `arena_reset(&arena)` with zero individual free overhead and no garbage collection pauses.

### Expression Tree (`expr.odin`)
- Whitelisted subset (§9.1) parsed from string holes, conditional expressions, and attribute values.
- Supported operations:
  - Identifiers and field access (`obj.field`).
  - Literals (`int`, `string`, `bool`).
  - Binary comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`).
  - Logical operations (`&&`, `||`, `!`).
  - Arithmetic addition and subtraction (`+`, `-`).
  - Prohibits division (`/`) to enforce `TE0011` diagnostic.

### Diagnostics & Validation
- Position-aware reporting (`file:line:col`) emitting standard diagnostic codes:
  - `TE0001`: Invoking a view procedure from within an event handler.
  - `TE0002`: Unsupported or illegal expression syntax.
  - `TE0003`: Circular component references in the dependency graph.
  - `TE0004`: Unsupported field types in component state struct.
  - `TE0005`: Invalid handler signature or parameter mismatch.
  - `TE0008`: Purity violation: state mutation or assignment inside a view procedure.
  - `TE0010`: Empty hole in template string (`{}`).
  - `TE0011`: Disallowed arithmetic operator (`/`).
  - `TE0012`: Key procedure signature mismatch.

---

## 4. Multi-Platform Code Generators (`soca:emit/*`)

### Web Target (`soca:emit/web`)
- **Zero-VDOM Architecture**: Compiles declarative trees directly into fine-grained DOM mutation routines without virtual DOM diffing or runtime overhead.
- **Static Template Strings (`templates.odin`)**:
  - Pre-computes static HTML fragments into `templates.js` (`TPL.<Component>`).
  - Elements are stamped via `<template>` clones.
- **Deterministic Path Addressing (`component.odin`)**:
  - Emits `refresh_<Component>` and `mount_<Component>` functions.
  - Elements and dynamic text nodes are referenced via deterministic child index traversal (`root.children[0].children[1]`) rather than DOM queries (`getElementById`).
- **Keyed Reconciliation**:
  - Dynamic lists rendered by `for_each` use keyed list reconciliation (`reconcileList`) to reorder, add, or delete nodes while preserving active focus, input values, and existing DOM nodes.
- **Handwritten Micro-Runtime (`soca_runtime/web/runtime.js`)**:
  - Minimal (~2.5 KB) runtime providing centralized event delegation (`onAction`), component instance registration, subtree unmounting, and input focus guards.

### Android Target (`soca:emit/android`)
- **State Emitter (`state.odin`)**:
  - Emits a Kotlin class where each state field is backed by Compose's `mutableStateOf`.
  - Type mapping: `int` → `Long`, `string` → `String`, `bool` → `Boolean`, `[dynamic]T` → `SnapshotStateList<T>`.
- **View Emitter (`view.odin`)**:
  - Emits idiomatic `@Composable` functions.
  - Maps layouts: `div` → `Column` or `Row`, `button` → `Button`, `text` / `to_text` → `Text`, `input` → `TextField`.
  - Keyed lists map to `items(..., key = { ... })`.

### iOS Target (`soca:emit/ios`)
- **State Emitter (`state.odin`)**:
  - Emits a Swift `@Observable final class` with native types (`Int`, `String`, `Bool`, `[T]`).
- **View Emitter (`view.odin`)**:
  - Emits SwiftUI `struct <Comp>View: View`.
  - Layout mappings: `div` → `VStack` or `HStack`, `button` → `Button`, `text` / `to_text` → `Text`, `input` → `TextField`.
  - Keyed lists map to `ForEach(..., id: \....)`.
  - Root entry component creates state via `@State private var s = <State>()`; child views accept direct references or `@Bindable var s`.

---

## 5. Incremental Dev Server (`soca:dev`)

- **Polling File Watcher (`watcher.odin`)**:
  - Zero external dependencies. Checks filesystem modification timestamps (`modification_time._nsec`) across input directories on a 100 ms loop.
- **Component Dependency DAG (`graph.odin`)**:
  - Constructs a directed graph of component references (`g.edges`) and reverse dependencies (`g.rev`).
  - Detects cycles to reject invalid structures (`TE0003`).
- **BFS Invalidation**:
  - Upon file modification, `affected_components` performs a Breadth-First Search across `g.rev` to find the transitive closure of dependent components.
  - Re-parses and re-emits only the affected components and the updated `manifest.json`.
  - Observed rebuild times are under 10 ms (well within the 50 ms latency budget).

---

## 6. Testing & Quality Assurance Pipeline (`check_fixtures.sh`)

Soca enforces a multi-layer verification suite executed via `bash check_fixtures.sh`:

| Layer | Type | Scope & Verification |
|---|---|---|
| **L0** | Odin Typecheck | Verifies `soca/ui` stub, positive fixtures (F1–F5), and negative fixtures syntax safety. |
| **L1** | Snapshot | AST inventory output of `soca parse` verified byte-identical against golden snapshots. |
| **L2** | IR Golden | S-expression tree dump of `soca ir` verified byte-identical for F1 and F3. |
| **L3** | Web Behavior | Headless browser behavioral tests (Bun / Node + Happy-DOM) testing full user interaction loops. |
| **L4** | Dev & Latency | Incremental rebuild verification (file touch invalidation) and latency check (< 50 ms budget). |
| **L5** | Android Golden | Kotlin/Compose emitted source verified byte-identical against golden suites + optional `assembleDebug`. |
| **L6** | iOS Golden | Swift/SwiftUI emitted source verified byte-identical against golden suites + optional `xcodebuild`. |
