# workflow (`wf`)

A multi-agent workflow engine. The user says what they want in five concrete commands; a
deterministic engine picks agents, runs them, proves the result with a check and reports back.
Agents do the work and the judgment calls (planning, reviewing); they never orchestrate.

Standalone: it depends on nothing outside this repo except the programs its adapters drive. It
never depends on Luvus, and Luvus never depends on it.

## What the user types

| Command | Example | Result |
|---|---|---|
| `fix` | `fix "login error when the password is empty" in ~/komerce/admin-v2` | patch |
| `build` | `build "dark mode toggle in settings"` | patch, plan shown first when large |
| `review` | `review PR #42` · `review feat/x` · `review my changes` · `review src/auth/` | notes |
| `ask` | `ask "why is the build slow?" about src/build/` | answer |
| `compare` | `compare "best cache design for X" with claude opencode agy` | report |

Options are plain words with one concrete argument (`in`, `only`, `check`, `with`, `about`,
`ask-first`, `just-go`, `no-merge`, `report-to`). Internal names (role, tier, policy) never show
up in what the user types. The source of truth is `spec/commands.md`.

## Layers

| Layer | Where | Knows |
|---|---|---|
| Spec | `spec/` | vocab, policy, commands, roles. Never names an agent CLI, a model or a host |
| Engine | `engine/` | interprets the spec; the only writer of task records |
| Runner adapters | `adapters/runners/<cli>/` | how one agent CLI meets a role's contract |
| Host adapter | `adapters/host/herdr/` | spawning, waiting and showing via `hc` and Herdr |
| Knowledge adapter | `adapters/knowledge/brain/` | reading context from and writing facts to `~/brain` |

### Spec files (Markdown + YAML frontmatter)

- `vocab.md`: the closed vocabulary (capabilities, outcomes and who reports them, tiers,
  results, policy predicates and actions). Unknown names are errors, never allowed silently.
- `policy.md`: rules (`when` predicate → `then` actions) and limits. Rules, not a pipeline: a
  plan of any shape is accepted when it keeps them.
- `commands.md`: the user's words → roles, result kind and accepted options.
- `roles/<name>.md`: one role's contract (`tier`, `can`, `needs`, `reports`) and its prompt.
  `{{var}}` must be in `needs` or filled by the engine (`context`). Agents report only
  `by: agent` outcomes: an agent can never claim that a check passed.

### Runner adapter contract

Each runner answers six things: `launch` (how the first prompt is passed), `trust <cwd>`,
`permissions <capabilities>`, `status_filter` (status noise to ignore), `models` (tier and cost)
and `enforces` (capabilities it can enforce; a runner is eligible for a role only when it
enforces all of the role's `can`). Fallback order is derived, never written by hand.

### Knowledge adapter contract

- `context(folder, paths, goal, budget)` → sections (by heading) with their source, at most
  `policy.limits.context_bytes`, marked in the prompt as private reference not to be copied.
- `propose(fact, evidence run)` → applied or rejected with the reason. Only technical facts a
  run proved; invariant changes need the user's approval.
- `record_decision(…)` only when the user says so, after confirming wording and scope
  (`project` or `all`). Decisions are revisable: later tasks surface them as questions.

## Where things live

| Place | Holds |
|---|---|
| `~/.dotfiles/modules/workflow/` (public) | configuration only: engine, spec, adapters, schemas |
| `~/brain/` (private) | task records `tasks/<YYYY-MM>/<id>.md`, facts in `projects/` and `knowledge/`, decisions (`## Decisions` in the project file, or `decisions.md`) |
| `~/.local/state/wf/` | locks, queue, engine socket, worktrees, raw check logs, diffs, terminal snapshots |

Nothing wf writes ever lands inside the repository a task works on, and a patch that copies
private knowledge injected into its run is blocked before merge (`leak_check`).

## IDs and who owns what

`w12` task → `w12.2` step (nested `w12.2.1`, at most `plan_depth`) → `w12.2-r1` run → `t21`
terminal → pid. wf owns task, step and run (`engine/records.ts`); hc owns terminals and
processes (`hc get`), which wf only references. A run's terminal carries the hc label
`wf.run=<run id>`, so the link works both ways. A retry or fallback is a new run, so the history
of why an earlier run failed is kept.

## Checks

```sh
bun test                 # in this folder
wf lint                  # the shipped spec; also runs in the package's checkPhase
wf lint <record.md>…     # task records against the spec
```
