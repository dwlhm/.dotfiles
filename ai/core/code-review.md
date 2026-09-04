# Code Review

Self-review checklist. Run this before reporting any task complete.
This is a gate, not a style guide. Each item maps to exactly one rule in `code-quality.md`.

```
[ ] Alignment confirmed — user's intent was verified before execution began; for follow-up prompts, alignment was re-confirmed with full updated scope (orchestration.md §0)
[ ] Principle derived — before coding, the general principle was explicitly stated and confirmed; implementation was derived from the principle, not the example (code-quality.md §6)
[ ] Source-first — implementation derived from official source/docs, not community guesses
[ ] No duplication — logic was checked against existing codebase before being written
[ ] Strict mode — enabled or preserved if already stricter
[ ] Documentation — every public API change has an updated documentation comment
[ ] Tests are requirement-derived — each test traces to an acceptance criterion, not to implementation code; at least one test was written before its passing implementation (code-quality.md §5)
[ ] Graph alignment — implementation matches the call graph in the approved plan (design-thinking.md)
[ ] Delta report produced — all implementation decisions not in the approved plan are listed explicitly; user has seen the report before task was marked done (orchestration.md §4)
[ ] Commit message — follows Conventional Commits format (code-quality.md §8)
[ ] No unjustified dependencies — every new dependency has an explicit reason
[ ] Single responsibility — each changed function/module does exactly one thing completely
```

If any item cannot be checked, state why before marking the task done.
