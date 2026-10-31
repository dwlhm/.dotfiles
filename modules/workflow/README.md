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

`runner.md` states the facts: `enforces` (capabilities it can enforce; a runner is eligible for a
role only when it enforces all of the role's `can`), `multiline` (whether the CLI runs a
multi-line shell command; if not, workers report on one line with `--escaped`), `trust` and
`models` (tier and cost). `runner.ts` exports `launch(model, prompt, cwd, can, check) → { argv,
env }` (first prompt, permissions, per-run trust where the CLI allows it), plus `trust(cwd)` when
`trust: true` (check, or throw with the fix), an optional `noise(status)` filter and an optional
`hook(stdin, env)` for CLIs whose only strict enforcement is a tool hook (`wf hook <runner>`,
registered by the Nix module, silent outside wf runs, fails closed inside them). The fallback order
is derived (cheapest eligible tier first), never written by hand; a retry or fallback is a new run.

| Runner | Isolation | Trust |
|---|---|---|
| `opencode` | `OPENCODE_CONFIG_CONTENT` permission rules, `--standalone` server per run | none needed |
| `claude` | `--restricted --strict-mcp-config --tools … --allowedTools … --permission-mode dontAsk` | read from `~/.claude.json` (inherited by subfolders); never written |
| `agy` | `wf-worker` PreToolUse hook denies outside the role; `--settings` allows the role's commands | `--settings trustedWorkspaces` for that session |

### Host adapter contract

`spawn(name, cwd, argv, env, labels)`, `get`, `waitChildren`, `snapshot`, `close`, `send`. The hc
host prefixes argv with `env(1)` because hc terminals do not inherit the caller's environment;
the engine passes its own location (`WF_*`) so a worker's `wf report` reaches it. Status is only
what the program reports (OSC 7501): a run has started once it was seen `working`.

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

## The engine process

Stages: a command's `roles` run in order, each on what the previous produced; with `many: true`
the first stage runs once per agent in parallel (`compare`), and the later stages pick the
cheapest eligible agent. A command is available once the engine can fill every prompt variable its
roles need (`engine/plans.ts`), so commands switch on as their inputs are built.

`wf serve` is one long-lived hc terminal (`wf` for the default state, `wf-<hash>` for another
`WF_STATE`); any `wf <command>` starts it when nothing answers on `~/.local/state/wf/wf.sock`
(concurrent clients share one; an idle engine running older wf code is replaced). Workers are its
children and die with it; on restart, runs left
open become `infra` and their step moves on. `wf report` never starts an engine.

## Checks

```sh
bun test                 # in this folder
wf lint                  # the shipped spec; also runs in the package's checkPhase
wf lint <record.md>…     # task records against the spec
```
