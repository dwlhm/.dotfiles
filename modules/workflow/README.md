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
| `review` | `review "PR #42"` · `review feat/x` · `review "my changes"` · `review src/auth/` | notes |
| `ask` | `ask "why is the build slow?" about src/build/` | answer |
| `compare` | `compare "best cache design for X" with claude opencode agy` | report |

`review` targets are resolved by the engine before any agent starts (`engine/targets.ts`):
`"my changes"` / `perubahanku` (uncommitted), a branch (against the default branch), a path inside
the work folder, or `"PR #42"` / a PR URL. For a PR the engine runs `gh` and hands the reviewer the
title, body and diff (capped) fenced as untrusted data the content cannot close; the reviewer
only reads, needs no network and no gh, and the repo is never changed. The resolved target text
lives in `~/.local/state/wf/tasks/<id>/target.md`; the record keeps only its label.

`fix` (patch work, `engine/land.ts`): the check is the user's `check "…"`, or the repo's one
unambiguous, runnable test command (`engine/checks.ts`), else the user is asked to name it. Work
starts from the user's HEAD plus what wf already merged into `wf/integration` and the user has
not merged yet (a merge made in the object store only; a conflict between them is refused up
front). Each patch step gets a branch `wf/<step>` (suffixed when taken) and a worktree under
`~/.local/state/wf/worktrees/<repo>-<hash>/`; the worker edits there. When it reports done, the
engine itself checks: something changed, only inside `only`, the check passes, then commits,
runs `leak_check` (a long line of the run's private context inside an added line blocks it) and
merges `--no-ff` into `wf/integration` in its own worktree (or wherever that branch is already
checked out, if clean). A failure goes back to the worker as feedback: the same model retries up
to `retries_per_tier`, then a higher tier. A merge conflict is the user's. The user's checkout,
index and current branch are never touched; `wf/integration` reaches their branch only on their
command. Claude Code must trust the worktree folder once (open `claude` in
`~/.local/state/wf/worktrees` and accept); until then claude runs fall back to other runners.

`build`: a planner (role `plan`, `writes: plan`) reads the code and reports blocks of `step:` /
`only:` / `check:` / `after:` / `qa:` (and a final `later:` for what remains). The engine checks
the plan (`engine/planfmt.ts`: every step has paths and a check, `after` names earlier steps,
steps that can run together never share paths, at most `steps_per_level`) and sends a broken one
back with the reasons. A plan of more than `small_task_steps` steps waits for the user
(`awaiting_approval`, exit 3): `wf approve <task>` starts it, `wf tell <task> "…"` sends it back
with their words (`just-go` skips, `ask-first` forces). Steps run as soon as what they come
after has merged, in parallel otherwise; a step that comes after others branches from
`wf/integration` so it sees their work. A `qa:` command adds a paired qa step. Once every step
merged, the task's check runs once more on `wf/integration` (all together) before the curator
may run; a failure there is the user's. `later:` plans the next milestone the same way. A worker that finds its step too big reports `too_big` with
sub-steps in the same block format: they must stay inside the step's paths and never go deeper
than `plan_depth` (past it the user decides); the step becomes `split` and ends with them.

After patch work lands, policy `curate_facts` adds the knowledge-writing role (`curate`,
`after: true`, `writes: knowledge`): it gets the evidence (each step's result and why earlier
runs failed) and reports `nothing` or lines `project: …` / `topic <name>: …`. The engine appends
them, with date and source run, to `## Verified facts (wf)` in the project's brain file or to
`knowledge/<topic>.md` (a new topic is registered in the index), skipping duplicates, in one
commit touching only those files. Nothing else in the brain is ever edited, decisions are never
recorded, and a curator that fails never fails the task.

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

## Control commands (contract)

`<what>` is a task, step or run id (`w12`, `w12.2`, `w12.2.1`, `w12.2-r1`) or words matched,
case-insensitively, as a substring of open tasks' goals and step titles. Exactly one match is
needed; otherwise the error lists the candidates as `id: title`. The resolution is pure, in
`engine/select.ts`: `select(tasks, words) → { task, step?, run? } | { error }`.

Engine side (`engine/control.ts`: functions over the engine, like `engine/build.ts`; each a
server op; every refusal names the task's current status):

- `status` → each open task: id, command, status, goal, done/total over its work leaves, and its
  active runs (run id, runner·model, terminal address).
- `show <what>` → text. A task: its header, then its steps as a tree (two spaces per depth)
  `w12.2 [running] <title>`, each followed by its runs `w12.2-r1 opencode·<model> <outcome or
  running>: <summary> (<terminal>)`. A step: the same for that step. A run: runner, model,
  terminal, started, ended, outcome, summary, and the paths of its saved artifacts
  (`<state>/runs/<run>/report.md`, `screen.txt`, `context.md`, those that exist).
- `pause <task>`: running → `paused`; nothing new is dispatched while paused, active runs go on
  and are still reconciled. `resume <task>`: paused → running, then advance.
- `stop <task>`: every active run is ended with the engine outcome `stopped` (added to the vocab:
  "The user stopped the task") and its terminal closed; unstarted steps become `stopped`; the
  task closes as `stopped`. Worktrees and branches are kept and listed in the result.
- `tell <task> "<text>"`: while running, typed into every active run's terminal as
  `Message from the user: <text>`; while awaiting approval, the existing plan change.
- `take <step|run>`: the step's active run is taken — the engine stops reconciling it (no start
  or run time limits, no reminders) until `give back`; the reply gives its terminal address. The
  run still ends through `wf report` (the user may run it). `give back <step|run>`: reconciling
  resumes, with its time limits counted from now.

CLI side (`engine/control-cli.ts`, keeping `engine/cli.ts` small): `wf status`, `wf show
<what>`, `wf watch <what>` (the active run's terminal through `hc attach`; an ended run prints its
saved `screen.txt`), `wf pause|resume|stop <what>`, `wf tell <what> "<text>"`, `wf take <what>`,
`wf give back <what>`, and `wf merge [in <folder>]`, which needs no engine: in the user's repo it
refuses a dirty working tree or an integration branch with nothing new, else runs
`git merge --no-ff wf/integration -m "Merge wf/integration"`; on conflict it aborts the merge and
lists the files. This is the only command that changes the user's branch, and only when they run
it.

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
