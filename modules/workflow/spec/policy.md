---
rules:
  - when: edits_code
    then: [require_check, use_worktree]
  - when: touches_ui
    then: [add_qa_step]
  - when: result_patch
    then: [leak_check, merge_into_integration]
  - when: large_task
    then: [require_approval]
ui_globs:
  - "**/*.{tsx,jsx,vue,svelte,html,css,scss}"
  - "**/*.swift"
  - "**/*.anoa"
limits:
  small_task_steps: 1
  plan_depth: 2
  steps_per_level: 8
  retries_per_tier: 2
  context_bytes: 24000
  start_seconds: 120
  run_minutes: 20
  check_minutes: 10
integration_branch: wf/integration
---

Invariants the engine enforces on every task, whatever its shape. They are rules, not a pipeline:
the plan (from the `plan` role, an agent, or the user) is free in shape and is rejected with the
reason when it breaks one of them.

- `small_task_steps`: a plan with more steps than this is a large task and needs approval, unless
  the user said `just-go`; `ask-first` asks even for a small one.
- `plan_depth` / `steps_per_level`: past these the engine stops splitting and asks the user.
- `retries_per_tier`: quality failures (check `fail`) retry on the same tier this often, then move
  up one tier; `infra` moves to the next eligible runner at once.
- `context_bytes`: the most private knowledge injected into one run's prompt.
- `start_seconds`: a run that has not started working by then is an `infra` failure; statuses
  before it first works (a sign-in or trust notice, an idle prompt) are startup noise.
- `run_minutes`: a run still working after this is stopped as an `infra` failure.
- `check_minutes`: the longest the engine lets a step's check run before it counts as failed.
- The integration branch is merged into `main` only on the user's command.
