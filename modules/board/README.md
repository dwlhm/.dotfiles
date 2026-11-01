# board

A kanban of tasks for the person and their agents (claude, opencode, agy, codex). The person makes
tasks and tags an agent; an agent working a task can split it into sub-tasks for other agents.
The Herdr mod is the view; the `board` CLI is the only writer. Independent of `wf` and Luvus.

## Model

| Field | Meaning |
|---|---|
| `id` | `T3` (root, made by the person) → `T3.1` (sub-task, made by T3's agent) → `T3.1.2` |
| `phase` | `backlog → plan → work → review → test → done`, plus `waiting` and `failed` |
| `forked_from` | the task this one follows up on (`board fork`), or null |
| `creator` | `user` or the task whose agent made it: **every hand-back goes to the creator** |
| `assignee` | agent, live hc terminal, and its session id: `open` resumes with full context |
| `worktree` | the task's own git checkout `{ top, target, path, branch, sub }`, or null outside git |
| `auto_land` | its agent puts its commits on the target's branch itself; else the person lands them |
| `commits` | the commits it handed over / landed: the record of what it changed |
| `report` | the agent's last report while it stands (`cli/report.ts`): cleared by an answer or a phase change |
| `inbox` | hand-backs that arrived while the agent was not running; sent first on resume |

Rules: only the person makes root tasks (`board add` refuses inside an agent's terminal); an
agent makes sub-tasks of its own task only (`board sub`). An agent sets its card's working
phase (`plan|work|review|test`) and ends with one `report` (`done`, `failed`, or `question` /
`stuck` → `waiting` on its creator). A report from a sub-task is typed into the creator's agent
(`[board] T3.1 done: …`), or kept in its inbox when that agent is not running. The person (or
the board) can move any card to any phase and answer any waiting task.

**Done or failed ends the agent** (`Board.end`): its session stays for `open` (to look back) or a
fork; a task that ran in a worktree loses it then, so only a fork continues it (see Worktrees). A card moved there by the person ends its terminal at once; an agent's own `report done|failed`
runs inside that agent's turn, so a detached `sh` (`Terminals.killAfterTurn`, without
`HC_TERMINAL_ID`) runs `hc wait` on it (at most 600 s), then `hc kill` + `hc rm`.

**Follow-ups** (`board fork <id> ["<title>"] [--brief] [--agent]`, the person only): a new root task
with `forked_from: <id>`, in `<id>`'s folder, with `<id>`'s title and agent unless given. On
`assign`, the same agent forks the source's session when its CLI can fork one we can resume
(`AgentSpec.fork`); any other agent starts fresh and its prompt carries the source's report and
brief. The source only logs `forked into T7`.

## Worktrees (`cli/worktree.ts`)

A task whose folder is in git works in **its own worktree**, made on `assign`:
`~/.local/state/board/worktrees/<repo>-<hash>/t7` on branch `board/t7`, from the HEAD of its
**target**, the checkout its commits land into: the person's checkout for a root task, the
parent's worktree for a sub-task (same repository). The agent runs in the same sub-folder there.
A folder outside git runs in place, as before. So parallel tasks never share files, and
`codex resume --last` / `agy --continue` (latest session *in the folder*) find their own session.

- The agent commits there (trailer `Board-Task: T7`) and rebases onto the target's HEAD before
  `report done`; the board refuses done while the worktree has uncommitted changes or is behind.
- **`auto_land`** (`--auto-land`, the checkbox in the new task dialog; sub-tasks always): `report
  done` fast-forwards the target's branch to the task's branch (`git merge --ff-only`) → done.
- Otherwise `report done` with commits puts the card in **waiting** on the person, the agent still
  running: **Land** (`board land T7`) fast-forwards; an answer instead asks the agent for changes.
  When the target moved on, `land` sends the agent back to rebase (phase `work`); the person never
  resolves a conflict. Fast-forward fails when the commits touch files with uncommitted edits in
  the target: the error says so and nothing changes.
- Done or failed removes the worktree and its branch (`Board.end`); landed commits stay in
  `commits` (the dialog lists them, each opening its `git show --stat`). An ended task with a
  worktree cannot be resumed (`open` refuses): `board fork` follows it up, and its worktree reuses
  the source's folder when free, so the forked agent session is found there.
- Moving a card to done by hand refuses unlanded work (land it, or move it to failed to drop it);
  `board rm` refuses it without `--force` (the dialog's confirmed Delete passes it).

The CLI finds the calling agent's task by `HC_TERMINAL_ID` (each task's agent runs in its own
hc terminal), so agents never pass their id. The first prompt (`cli/protocol.ts`) tells the
agent how to use the board; nothing else needs configuring per agent.

## Reports (`cli/report.ts`)

`board report <status> "<headline>" [--detail <markdown>] [--option <answer>]...` keeps
`{ status, headline, detail, options, at }`. The card shows the headline (the question, the
blocker or the outcome, in one sentence); the dialog renders the detail as Markdown and, for a
question, each option as a one-click answer (the first is the agent's recommendation) beside a
free-text answer. Free text goes through the same parser: a question's headline is its first line
that asks something, a headline past 120 characters is cut at its first sentence, `1)` steps
(inline too) become a Markdown list and a lone line break a new paragraph. Tasks saved before
reports had a shape get one from their closing note when read. A creator's agent receives the
report as text (`reportText`): headline, detail, numbered options.

## Agents (`cli/agents.ts`)

| Agent | Start | Resume | Fork |
|---|---|---|---|
| claude | `claude --session-id <uuid> "<prompt>"` | `claude --resume <uuid> ["<inbox>"]` | `claude --resume <old> --fork-session --session-id <new> "<prompt>"` |
| opencode | `opencode --session ses_board… --prompt "<prompt>"` | `opencode --session <id> [--prompt …]` | fresh (`--fork` picks an id we cannot learn) |
| agy | `agy -i "<prompt>"` | `agy --continue [-i …]` (agy takes no session id: latest in the folder) | fresh |
| codex | `codex "<prompt>"` | `codex resume --last ["<inbox>"]` (codex takes no session id: latest in the folder) | `codex fork --last "<prompt>"` |

`cli/agents.ts` is the only list of agents: `board agents` prints it and the mod reads it there.
A task's folder must exist (`--cwd` is resolved against the caller's folder). Option values may
start with a dash (`--brief "- a list"`); a title that does is written after `--`.

Each runs as `hc run --bg --no-parent --name board-t3-1` with labels `board.task=<id>`,
`herdr.space=board`, `herdr.tab=board-t3-1`: Herdr shows a **Board** space with one tab per task
(the mod renames tabs to `T3 · title`). No parent, so stopping a creator never kills its
sub-tasks' agents. Program paths are resolved by the CLI, since hc terminals do not inherit PATH.

## The mod (`mod/`, copied to `~/.config/herdr-app/mods/board` on activation)

`board ui` opens it as a tab. Columns by phase; once root tasks span two folders, a bar
under the header filters the board to one folder (`All · dotfiles 3 · rove 1`). Each card shows
its folder (short name, `parent/name` where two share one; full path on hover), the agent, its live state
(spinner / Needs you, from Herdr's `terminals()`), what it is doing now (the agent's own OSC
7501 message), its sub-tasks with progress, and a button that shows or resumes the agent's
tab. A card opens the detail dialog: move phase, start / show / resume / stop the agent, answer
a waiting task, brief, sub-tasks, inbox, activity log, **Follow up** (done/failed: opens the new task
dialog as a fork, folder fixed, agent = the source's), delete. A follow-up shows `↳ T6` on its card
and in its dialog. The board reloads on every change
under the store folder (`watchFolder`), and notifies when a root task needs you or finished.
`mod/ui.js` holds the design tokens and shared pieces (theme colors and app icons only).

## Where things live

| Place | Holds |
|---|---|
| `~/.local/state/board/tasks/<id>.json` | one file per task (`BOARD_STATE` overrides the folder) |
| `~/.local/state/board/worktrees/<repo>-<hash>/<task>` | the worktrees of running tasks in git |
| `cli/` | store (locking, ids), ops, report (shape + parser), worktree, agents, terminal, protocol, CLI; `fake.ts` = the tests' fake hc (left out of the package) |
| `mod/` | the Herdr mod: `main.js` (roles), `board.js`, `card.js`, `detail.js`, `report.js` (also Land), `changes.js` (commits), `compose.js`, `data.js`, `ui.js` |

## Checks

```sh
bun test                                         # in this folder; a fake hc (cli/fake.ts); git runs for real on temp repos
herdr-app check ~/.config/herdr-app/mods/board   # after activation
```
