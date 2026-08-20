# Code Quality

Language and environment agnostic. Each principle governs exactly one concern.

## 1. Source-First Authority

Derive usage patterns, API signatures, and idioms from the library, framework, or
language's own source code and official documentation.

Do not use community blog posts, StackOverflow answers, or "best practice" articles
as the primary reference. If official docs are ambiguous, read the source.

## 2. Strict Mode

Enable the strictest compile, lint, or type-check mode available in the current
environment. Examples: TypeScript `strict: true`, Rust `#![deny(warnings)]`,
Python `mypy --strict`, Go `go vet`, ESLint `recommended`.

If the project already runs a stricter configuration, preserve it.

## 3. DRY — Do Not Repeat Yourself

Before writing new logic, check whether it already exists in the codebase.
Reuse and extend. Extract into an abstraction only when:
- the abstraction has a clear, single responsibility, AND
- it removes actual duplication (not hypothetical future duplication).

Do not extract to satisfy a pattern for its own sake.

## 4. Do One Thing Perfectly

Every function, module, hook, and rule must do exactly one thing and handle all
cases for that one thing completely.

A function that partially handles a case and inconsistently delegates the rest is
worse than a simpler function that fully handles all cases upfront.

Complexity is justified when it directly improves the user's experience or
capability. Complexity that serves only architectural purity is not.

## 5. Requirement-First Testing

Tests must be derived from acceptance criteria, not from the implementation.

Before writing tests, re-read the plan's acceptance criteria. Each test case must
trace to one acceptance criterion — not to a line of implementation code.

Every test suite must include:
1. The happy path from the plan's acceptance criteria
2. At least one boundary condition (empty, null, max, min, wrong type)
3. At least one variation NOT present in the prompt or example

If all tests pass on the first run with zero failures, treat this as a warning:
the tests may be validating the implementation, not the requirement.
Write at least one test case you expect to fail *before* writing its implementation.

If tests cannot be run — e.g., no test runner configured — document why and
describe the manual verification performed instead.

## 6. Principle over Example

Never implement for the specific example given in the prompt. Always implement
for the principle the example illustrates.

Before writing any code, explicitly state:
> "This example illustrates: [principle]."
> "The implementation must handle: [general case]."

If you cannot state the principle without referencing the specific example's values,
you do not yet understand the problem. Ask for clarification instead of guessing.

Red flags that signal example-driven (not principle-driven) implementation:
- Hardcoded values that appear verbatim in the user's prompt
- Conditional branches that only exist for the specific input shown
- Logic that produces wrong output if input length, order, or format changes slightly

## 7. Documentation Parity

Any modification to a public function, exported type, or public interface must
include or update the environment-appropriate documentation comment:
JSDoc, docstring, KDoc, RDoc, Rustdoc, GoDoc, etc.

Internal or private functions are exempt unless they already carry documentation.

## 8. Commit Message Format — Conventional Commits

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`
Scope: the module or file area affected.
Description: imperative present tense. No period at the end.

Example: `feat(auth): add JWT refresh token rotation`
