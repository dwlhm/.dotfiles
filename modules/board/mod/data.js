// The board's data: tasks from the `board` CLI (the only writer), live agent state from Herdr's
// own terminal list (labels `board.task`), so the view never parses the store itself.
import { exec, home, knownAgents, openOverlay, run, spaces, terminals } from "herdr";

export const STATE = `${home()}/.local/state/board/tasks`;

/** Runs `board …`; resolves with stdout, rejects with its error line. */
export async function board(args) {
  const r = await exec("board", args).catch((e) => ({ code: 127, stdout: "", stderr: String(e) }));
  if (r.code !== 0) throw new Error(r.stderr.trim().replace(/^board: /, "") || `board exited ${r.code}`);
  return r.stdout.trim();
}

/** The new task dialog; with `from`, a follow-up of that task (`board fork`). */
export function openCompose(programs, from = null) {
  openOverlay({ mod: "board", props: { role: "compose", programs, from }, kind: "dialog", width: 540, height: 540 });
}

export const loadTasks = async () => JSON.parse(await board(["ls", "--json"]));

/** task id → { address, status, msg, program } for agents running now. */
export function liveByTask() {
  const map = {};
  for (const term of terminals()) {
    const id = term.labels?.["board.task"];
    if (!id || term.state !== "live") continue;
    map[id] = { address: term.address, status: term.status ?? "idle", msg: term.report?.msg ?? "", program: term.program };
  }
  return map;
}

/** Program info (icon, tint) for the agents the board can start (`board agents`), keyed by name
 *  in the CLI's order; null when Herdr does not know the program. */
export async function agentPrograms() {
  const [names, list] = await Promise.all([board(["agents"]), knownAgents().catch(() => [])]);
  const out = {};
  for (const name of names.split("\n")) out[name] = list.find((p) => p.key === name || p.run?.[0] === name) ?? null;
  return out;
}

export const tabId = (id) => `board-${id.toLowerCase().replaceAll(".", "-")}`;

/** Shows the task's tab (space `board`, tab = its terminal name, set by the CLI's labels) once
 *  Herdr has it: a fresh terminal takes a moment. Falls back to peeking at the terminal. */
export function focusTask(id, address, cx, tries = 12) {
  const space = spaces().find((s) => s.id === "board");
  if (space?.tabs.some((tab) => tab.id === tabId(id))) {
    run("space.select", { id: space.id });
    run("tab.select", { id: tabId(id) });
  } else if (tries > 0) cx.timer.after(250, (cx) => focusTask(id, address, cx, tries - 1));
  else run("terminal.peek", { terminal: address });
}

/** Herdr names a labelled tab after its folder; give board tabs their task's name. */
export function nameTabs(tasks) {
  const byTab = Object.fromEntries(tasks.map((t) => [tabId(t.id), t]));
  for (const s of spaces()) {
    if (s.id === "board" && s.name !== "Board") run("space.rename", { id: s.id, name: "Board" });
    for (const tab of s.tabs) {
      const task = byTab[tab.id];
      const want = task && `${task.id} · ${task.title}`.slice(0, 40);
      if (want && tab.name !== want) run("tab.rename", { id: tab.id, name: want });
    }
  }
}
