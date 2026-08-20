---
trigger: always_on
---
# Design Thinking

```
X → Graph → Effect<A, E, R>
│              │   │  │  │
│              │   │  │  └─ what each node needs     (§5)
│              │   │  └──── where the graph breaks   (§4)
│              │   └─────── what flows through nodes  (§2)
│              │
│              └─ nodes = functions, edges = data flow
│
└─ the problem: what you’re trying to build

§1  Shapes       the nouns: records, IDs, variants, errors
§2  A            happy path as call graph
§3  Cardinality  one-shot (Effect) or many (Stream)
§4  E            break points: retry, escape, die
§5  R            dependencies: compile-time proof
§6  Boundary     Schema: unknown → trusted at edges
§7  Behavior     .pipe() wraps without changing the graph
§8  Scope        acquire/release tied to lifecycle
§9  Test         swap R, same graph shape
§10 Code         gen body = A, .pipe() = E
```

Read the problem. Draw the data flow as a call graph. Write code that IS the graph. If the code doesn't match the graph, something is wrong.

---

## When to Apply

Apply this framework in **all phases except implementation**:

| Phase | Design Thinking? |
|---|---|
| Problem analysis | ✅ Yes — draw the call graph |
| Planning / architecture | ✅ Yes — annotate A, E, R on every node |
| Code review / debugging | ✅ Yes — verify code matches the graph |
| Implementation | ❌ No — follow the approved plan verbatim |

During implementation, the implementing agent MUST follow the approved plan without
creative deviation. The plan must therefore be detailed enough to leave no ambiguity:
exact file paths, function signatures, data flow, error handling strategy, and
dependency requirements must all be specified. **Ambiguity in the plan = drift in the
implementation = quality regression.**

> **Prerequisite**: Run the Alignment Verification Protocol (`orchestrator.md §0`)
> before starting this pipeline. Do not draw the call graph until intent is confirmed.

---

## 1. Name the shapes

What are the things? Before drawing a graph, define the domain language.

- **Records** -- entities that flow through nodes. A User, a Product, an Order.
- **IDs** -- identity of things. Branded, constrained, never a bare string.
- **Variants** -- internal state transitions. A step is Continue or Finished. A status is Pending, Active, or Cancelled.
- **Errors** -- named failure modes. Not strings. Tagged, structured, carrying context.

These are the nouns. The graph is the verbs. You cannot draw the graph until you know what flows through it.

For each shape, enumerate every state it can be in — not just the state the example
shows. A User is not only a logged-in user: it is also unauthenticated, partially
registered, suspended, deleted. Every state must either flow through the graph or be
explicitly rejected at the boundary.

**Unstated states are not non-existent states. If a state is possible, it must
appear in the graph.**

## 2. Think A first

Map the happy path as a call graph before writing any code.

```
F1(A) -> F2(A) -> F3(A)
```

What is the success data flow? What goes in, what comes out, what transforms happen in between? This graph IS your program structure. Draw it first. The code follows.

### When the graph must conform to a named methodology

If the system implements a named pattern, protocol, or methodology, the call graph
MUST be derived from that methodology's structural invariants — not from intuition.
A graph that violates the invariants does not implement the methodology, regardless
of how plausible it looks. See `methodology_verification.md` for the verification protocol.

## 3. One or many?

Is each node one-shot or a flow?

- **One value** -- the node runs once, produces A, done.
- **Many values over time** -- the node emits A repeatedly. Events, subscriptions,
  paginated pulls, real-time feeds.
- **Time-bounded** -- the result is valid for a window. Cache it. Deduplicate
  concurrent lookups.

Same three channels (A, E, R) in all cases. Different cardinality. Mark it on the
graph so the code matches.

Before moving on: what does this node produce when the input is empty? When exactly
one item fails validation mid-stream? When the input exceeds system capacity? If any
of these has no answer, the graph is incomplete. Do not proceed until each has a
defined A or a defined E.

## 4. Think E second

Mark where the graph can break. Each break point is one of three things:

- **Retry** -- transient failure, try again. Network timeout, rate limit, connection reset.
- **Escape Hatch** -- recoverable, return an alternative. Fallback value, cached result, default.
- **Die** -- defect, invariant violation, programmer bug. NOT a domain error. Something is fundamentally wrong.

Errors are VALUES in the E channel until you truly cannot handle them. They flow
through the graph like data. You decide at each node: retry, escape, or let it
propagate. Only `die` when the program's assumptions are violated.

**E must be exhaustive, not illustrative.** Do not list the errors the current
example happens to trigger. List every way this node can fail, including failures
the example will never reach. If you cannot name all failure modes without looking
at the implementation, you do not yet understand this node. Do not write code for
a node you do not understand.

## 5. Think R third

Mark what each node in the graph needs to exist. "We cannot do X if we don't have Y."

R is compile-time proof that dependencies are satisfied. Every node declares what it requires -- a database connection, a config value, an HTTP client. R shrinks as you provide layers. When R is empty (`never`), the program can run. If R is not empty, the compiler tells you exactly what's missing.

## 6. Trust at boundary

Where does untrusted data enter the graph? HTTP requests, file reads, environment variables, user input, third-party API responses.

Schema converts `unknown -> trusted` at the edges. One definition = type + validator + transformer. Define it once, use it everywhere.

Trust nothing at the boundary. Trust everything inside. The boundary is the only place you parse. After that, the types guarantee shape.

## 7. Layer behavior

What cross-cutting concerns wrap nodes? Retry policies, timeouts, logging, tracing, caching.

These are added as a **composition layer** WITHOUT changing the core graph. The happy
path stays readable — you can read it without wading through retry logic and timeout
configuration. Behavior is composed orthogonally. The graph says WHAT happens. The
layers say HOW it behaves under pressure.

## 8. Scope resources

What nodes acquire resources? Database connections, file handles, WebSocket connections, child processes.

Acquire/release is a type guarantee. If a node opens a connection, scope ensures it closes -- even on error, even on interrupt. Cleanup is structural, not a TODO comment you hope someone remembers.

## 9. Swap R to prove it

The call graph doesn't change between production and tests. Only R changes.

Same graph shape. Same A flowing through. Same E possible. Different layer behind R. If the graph can't run with a test R, the design has hidden dependencies. If you have to mock the world to test one node, the node is doing too much.

This is the payoff of separating A, E, and R -- you prove the graph correct by swapping what's behind R.

## 10. Separate A from E structurally

The separation of A (step 2) and E (step 4) must be visible in code structure:

- **The happy path** -- the main function body. It reads as a linear sequence of A
  values flowing through nodes. No error handling inline.
- **The error layer** -- wraps or follows the happy path. The complete E enumeration:
  every failure mode caught, retried, or transformed.

**This is not a stylistic preference.** If error handling lives inside the happy path,
A and E are tangled — you cannot read the call graph without wading through catches
and retries. The happy path IS the call graph from step 2. The error layer IS the
error annotation from step 4.

### E scoping at layer boundaries

Each layer scopes its own E before exposing to the next layer. Consumers MUST NOT see
implementation errors from deeper layers. Each boundary translates internal errors to
the vocabulary of its own layer.

### Divergent strategies

When two nodes in the same happy path need different E handling — one fails hard, the
other falls back gracefully — that is a **divergent strategy**. Handle each node's E
inline, because the outer error layer cannot distinguish which node produced which
error.

This is the ONE exception to keeping E out of the happy path. It exists because the
graph has a fork with different failure semantics. Mark it explicitly — it must be
rare.

---

## The Pipeline

```
PROBLEM
  -> Alignment check (orchestrator.md §0)         -> confirm intent before proceeding
  -> "What are the shapes?"                       -> define the domain language
  -> "What is the happy path?"                    -> draw the call graph (A)
  -> "Is each node one-shot or a flow?"           -> mark cardinality
  -> "Where can it break?"                        -> annotate errors on the graph (E)
  -> "What does each node need?"                  -> annotate requirements on the graph (R)
  -> "Where does untrusted data enter?"           -> Schema at graph boundaries
  -> "What wraps nodes without changing them?"    -> pipe behavior orthogonally
  -> "What resources need cleanup?"               -> scope lifecycle
  -> "Can I swap R and the graph still works?"    -> verify with test layers
  -> "Does my code separate A from E structurally?" -> happy path and error layer are distinct
  -> Completeness gate: for each node, trace every input variant through the graph.
     Every variant must exit as a defined A or a defined E. Any variant that falls
     through without a defined exit is a defect planted before a single line of code
     is written. Fix the graph before writing code.
  -> PLAN                                         -> the plan IS the graph, fully specified
  -> CODE                                         -> the code IS the plan, no deviation
```

**If the code doesn't match the call graph, the implementation is wrong.**

**If the plan is ambiguous, the implementer will fill the gap with guesses.**
Every unanswered question in the plan is a quality risk.
