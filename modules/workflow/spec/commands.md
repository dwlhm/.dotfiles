---
commands:
  fix:
    about: Fix one concrete problem in a folder
    example: fix "login error when the password is empty" in ~/komerce/admin-v2
    roles: [implement]
    result: patch
    options: [in, only, check, with, ask-first, just-go, no-merge, report-to]
  build:
    about: Build a feature; the plan is shown first when it is large
    example: build "dark mode toggle in settings"
    roles: [plan, implement]
    result: patch
    options: [in, only, check, with, ask-first, just-go, no-merge, report-to]
  review:
    about: Review a PR, a branch, your uncommitted changes or a path, without editing
    example: review PR #42
    roles: [review]
    result: notes
    options: [in, with, report-to]
  ask:
    about: Research a question and answer it, without editing
    example: ask "why is the build slow?" about src/build/
    roles: [research]
    result: answer
    options: [in, about, with, report-to]
  compare:
    about: Ask several agents the same question and compare their answers
    example: compare "best cache design for X" with claude opencode agy
    roles: [research]
    result: report
    many: true
    options: [in, about, with, report-to]
options:
  in: { takes: folder, about: Where the work happens (default the focused pane's folder) }
  only: { takes: paths, about: The only paths workers may edit }
  check: { takes: command, about: "Proof the work is done, e.g. check \"bun test\" (default guessed from the repo, asked when unsure)" }
  with: { takes: agents, about: Use these agents instead of choosing automatically }
  about: { takes: paths, about: What the question is about }
  ask-first: { takes: nothing, about: Show the plan first even when the task is small }
  just-go: { takes: nothing, about: Do not ask about the plan even when the task is large }
  no-merge: { takes: nothing, about: Stop at the result's own branch; do not merge it }
  report-to: { takes: terminal, about: "Send the result to this terminal too (agents pass `me`)" }
takes: [folder, paths, command, agents, terminal, nothing]
---

The words the user types. Each command names the roles that do the work and the kind of result;
options are plain words with one concrete argument. Internal names (roles, tiers, policy) never
show up in what the user types.
