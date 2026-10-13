# Second Brain

Persistent knowledge base: `~/.dotfiles/ai/knowledge/`. Full format:
`ai/skills/second-brain/SKILL.md`.

## Research Protocol (focused & token-efficient)

- Retrieve surgically with `ai/scripts/kb` (`context | list | search | get`);
  never dump whole files into context.
- Read relevant knowledge before Tier 2, ambiguous, debugging, or dependency work.
- Skip the KB for trivial Tier 0–1 tasks.

## Capture-on-Novelty

Encountering an unknown case, gotcha, pattern, or constraint → record it to the
KB immediately (via Write Gate), not only at session end.

## Write Gate

1. **Dedupe** — read the target file first; update in place, never append duplicates.
2. **Precision** — at least one verifiable anchor (`symbol @ file:line`, version, date).
3. **Reconcile** — resolve contradictions before committing.

## Gotcha Taxonomy (2-Question Rule)

1. General to the ecosystem (another project could hit it) → `_shared/gotchas/<eco>.md`.
2. Bound to this project's logic → `<project>/gotchas.md`.

## Graduation

A gotcha or pattern recurring in ≥ 2 projects → `_meta/candidates.md` → graduate
to a skill or a core rule.
