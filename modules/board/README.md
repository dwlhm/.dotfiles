# board

A kanban of tasks for the person and their agents (claude, opencode, agy, codex). The person makes
tasks and tags an agent; an agent working a task can split it into sub-tasks for other agents.
The Herdr mod is the view; the `board` CLI is the only writer. Independent of `wf` and Luvus.

## Model

| Field | Meaning |
|---|---|
| `id` | `T3` (root, made by the person) → `T3.1` (sub-task, made by T3's agent) → `T3.1.2` |
| `phase` | `backlog → plan → work → review → test → done`, plus `waiting` and `failed` |
| `creator` | `user` or the task whose agent made it: **every hand-back goes to the creator** |
| `assignee` | agent, live hc terminal, and its session id: `open` resumes with full context |
| `report` | the agent's last report while it stands (`cli/report.ts`): cleared by an answer or a phase change |
| `inbox` | hand-backs that arrived while the agent was not running; sent first on resume |

Rules: only the person makes root tasks (`board add` refuses inside an agent's terminal); an
agent makes sub-tasks of its own task only (`board sub`). An agent sets its card's working
phase (`plan|work|review|test`) and ends with one `report` (`done`, `failed`, or `question` /
`stuck` → `waiting` on its creator). A report from a sub-task is typed into the creator's agent
(`[board] T3.1 done: …`), or kept in its inbox when that agent is not running. The person (or
the board) can move any card to any phase and answer any waiting task.

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

| Agent | Start | Resume |
|---|---|---|
| claude | `claude --session-id <uuid> "<prompt>"` | `claude --resume <uuid> ["<inbox>"]` |
| opencode | `opencode --session ses_board… --prompt "<prompt>"` | `opencode --session <id> [--prompt …]` |
| agy | `agy -i "<prompt>"` | `agy --continue [-i …]` (agy takes no session id: latest in the folder) |
| codex | `codex "<prompt>"` | `codex resume --last ["<inbox>"]` (codex takes no session id: latest in the folder) |

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
a waiting task, brief, sub-tasks, inbox, activity log, delete. The board reloads on every change
under the store folder (`watchFolder`), and notifies when a root task needs you or finished.
`mod/ui.js` holds the design tokens and shared pieces (theme colors and app icons only).

## Where things live

| Place | Holds |
|---|---|
| `~/.local/state/board/tasks/<id>.json` | one file per task (`BOARD_STATE` overrides the folder) |
| `cli/` | store (locking, ids), ops, report (shape + parser), agents, terminal, protocol, CLI |
| `mod/` | the Herdr mod: `main.js` (roles), `board.js`, `card.js`, `detail.js`, `report.js`, `compose.js`, `data.js`, `ui.js` |

## Checks

```sh
bun test                                         # in this folder; a fake hc, no real process
herdr-app check ~/.config/herdr-app/mods/board   # after activation
```
