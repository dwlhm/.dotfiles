---
capabilities:
  read: Read files inside the work folder
  edit: Edit files, only inside the step's `only` paths
  shell-report: Run `wf report` to hand back the outcome (every role has it)
  shell-check: Run the step's check command
  shell-git-read: Run read-only git (status, log, diff, show)
  shell-qa: Run `qa` UI test commands
  network: Fetch from the network
outcomes:
  done:
    by: agent
    about: The work is finished; the summary says what was done
  stuck:
    by: agent
    about: Cannot continue for a technical reason the agent explains
  question:
    by: agent
    about: Needs a what/why decision from the user
  too_big:
    by: agent
    about: The step needs splitting; the report proposes sub-steps
  fail:
    by: engine
    about: The check failed
  infra:
    by: engine
    about: The runner crashed, hung, ran out of quota or exited
  stopped:
    by: engine
    about: The user stopped the task
tiers: [small, medium, large]
results:
  answer: A direct answer, shown in the console
  report: A markdown report, opened as a pane
  notes: Review notes on a target, opened as a pane
  patch: Code changes on a branch, checked and merged into integration
predicates:
  edits_code: The step's role can edit files
  touches_ui: The step's `only` paths match the policy's UI globs
  result_patch: The command's result is a patch
  large_task: The plan has more steps than the policy's small-task limit
actions:
  require_check: The step must name a check; the engine runs it, never the agent
  use_worktree: The step runs in its own git worktree
  add_qa_step: The engine adds a paired qa step after it
  merge_into_integration: A passing result is merged into the integration branch
  leak_check: Block the merge when the diff copies private knowledge injected into the run
  require_approval: The user approves the plan before work starts
  curate_facts: After the work lands, the knowledge-writing role records what it proved
---

The closed vocabulary every other spec file uses. A name that is not listed here is an error, never
silently allowed: a runner that cannot enforce a capability is not eligible for a role that needs it.

Outcomes `by: engine` can never be reported by an agent: an agent cannot claim that a check passed.
