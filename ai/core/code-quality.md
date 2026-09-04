# Code Quality

Language and environment agnostic. Each principle governs exactly one concern.

## 1. Source-First Authority

Derive usage patterns, API signatures, and idioms from the library, framework,
or language's own source code and official documentation — not community blog
posts, StackOverflow answers, or "best practice" articles. If official docs are
ambiguous, read the source.

## 2. Strict Mode

Enable the strictest compile, lint, or type-check mode available: TypeScript
`strict: true`, Rust `#![deny(warnings)]`, Python `mypy --strict`, Go `go vet`,
ESLint `recommended`. If the project already runs a stricter configuration,
preserve it.

## 3. DRY — Do Not Repeat Yourself

Before writing new logic, check whether it already exists in the codebase —
reuse and extend. Extract an abstraction only when it has a clear, single
responsibility AND removes actual (not hypothetical future) duplication. Never
extract to satisfy a pattern for its own sake.

## 4. Do One Thing Perfectly

Every function, module, hook, and rule does exactly one thing and handles all
cases for that one thing completely. A function that partially handles a case
and inconsistently delegates the rest is worse than a simpler function that
fully handles all cases upfront. Complexity is justified only when it directly
improves the user's experience or capability — not architectural purity.

## 5. Requirement-First Testing

Tests are derived from acceptance criteria, not from the implementation.
Re-read the plan's acceptance criteria before writing tests; each test case
must trace to one criterion — not to a line of implementation code.

Every test suite must include:
1. The happy path from the plan's acceptance criteria
2. At least one boundary condition (empty, null, max, min, wrong type)
3. At least one variation NOT present in the prompt or example

All tests passing on the first run with zero failures is a warning: the tests
may be validating the implementation, not the requirement. Write at least one
test case you expect to fail *before* writing its implementation. If tests
cannot be run (e.g., no test runner configured), document why and describe the
manual verification performed instead.

## 6. Principle over Example

Never implement for the specific example given in the prompt; implement for the
principle the example illustrates. Before writing any code, explicitly state:
> "This example illustrates: [principle]."
> "The implementation must handle: [general case]."

If you cannot state the principle without referencing the example's values, you
do not yet understand the problem — ask for clarification instead of guessing.
Red flags: hardcoded values appearing verbatim in the prompt, conditional
branches existing only for the shown input, logic that breaks when input
length, order, or format changes slightly.

## 7. Documentation Parity

Any modification to a public function, exported type, or public interface must
include or update the environment-appropriate documentation comment: JSDoc,
docstring, KDoc, RDoc, Rustdoc, GoDoc, etc. Internal or private functions are
exempt unless they already carry documentation.

## 8. Commit Message Format — Conventional Commits

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`. Scope: the
module or file area affected. Description: imperative present tense, no period
at the end. Example: `feat(auth): add JWT refresh token rotation`
