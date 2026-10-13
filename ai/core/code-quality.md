# Code Quality

## Writing Standards

- **Search before writing** — reuse and extend existing implementations.
- **Single responsibility** — one function, one complete job.
- **Strict typing & linting** — satisfy the strictest modes available.
- **Functional isolation** — prefer pure functions; isolate side effects (see
  `design-thinking.md` Hard Rule 2).
- **Closed-loop dataflow** — every state emission / mutation traces to an active
  terminal sink.
- **Documentation** — update docs on public / shared API changes.
- **Commit format** — Conventional Commits: `<type>(<scope>): <description>`.

## Anti-Drift (think while coding)

- Conform to the approved plan and the standards above as you write — do not
  defer correctness to a later review pass.
- A drift from the plan or the established architecture is a defect; fix it at
  the source, not in a follow-up.
- Do not interleave heterogeneous payloads into a flat stream without
  type-partitioned dispatch.

## Testing

Skip if no test infrastructure exists unless tests are requested.

1. **Happy path** — assert core acceptance criteria.
2. **Boundary conditions** — empty, null, min, max, invalid types.
3. **Variation** — at least one case not illustrated in the prompt.
4. **End-to-end consumption** — verify the ultimate consumer receives the payload.
5. **Red-green** — verify the new test fails before applying the fix.
