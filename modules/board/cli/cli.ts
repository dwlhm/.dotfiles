#!/usr/bin/env bun
// `board`: the kanban task store for the person and their agents. See ../README.md.
import { parseArgs } from "node:util";
import { AGENTS } from "./agents";
import { Board } from "./ops";
import { reportText } from "./report";
import { isId, type Task } from "./store";
import { realSys, type Sys } from "./sys";

const NAMES = Object.keys(AGENTS).join("|");
const USAGE = `board — kanban tasks for you and your agents

  board add "<title>" [--brief <text>] [--cwd <dir>] [--agent ${NAMES}] [--auto-land] [--plan]
                                   in git the agent works in its own worktree; --auto-land lets
                                   it put its commits on your branch, else you land them;
                                   --plan: the agent plans first and works once you approve
  board assign <id> <agent>        start an agent session on the task
  board open <id>                  resume the task's agent if it ended (prints its terminal)
  board stop <id>                  end the task's agent (its session stays resumable)
  board fork <id> ["<title>"] [--brief <text>] [--agent ${NAMES}] [--auto-land] [--plan]
                                   a new task that follows up on <id>: same folder, its agent
                                   (default: <id>'s) starts from a fork of <id>'s session
  board phase [<id>] <phase> ["<note>"]   done or failed ends the task's agent
  board answer <id> "<text>"       answer a waiting task (after done: ask its agent for changes)
  board approve <id>               approve a plan-first task's plan: its agent starts the work
  board land <id>                  put a done task's commits on your branch (fast-forward)
  board ls [--json] · board show <id> [--json] · board rm <id> [--force]
  board agents                     the agents the board can start, one per line
  board ui                         open the board as a Herdr tab

For the agent working a task:
  board me · board sub "<title>" --agent <a> --brief "<text>"
  board phase plan|work|review|test "<note>"
  board report done|question|stuck|failed|plan "<headline>" [--detail <markdown>] [--option <answer>]...
                                   --option is repeatable; the first is your recommendation`;

const line = (t: Task) =>
  `${t.id.padEnd(8)} ${t.phase.padEnd(8)} ${(t.assignee?.agent ?? "-").padEnd(9)} ${t.title}${t.note ? ` — ${t.note}` : ""}`;

function show(t: Task): string {
  const head = [`${t.id} [${t.phase}] ${t.title}`, `folder ${t.cwd} · creator ${t.creator}`];
  if (t.assignee) head.push(`agent ${t.assignee.agent} · terminal ${t.assignee.terminal ?? "ended"} · session ${t.assignee.session ?? "-"}`);
  if (t.forked_from) head.push(`follows up on ${t.forked_from}`);
  if (t.worktree) head.push(`worktree ${t.worktree.path} · ${t.worktree.branch} → ${t.worktree.target}${t.auto_land ? " (auto-land)" : ""}`);
  if (t.commits.length) head.push("commits:", ...t.commits.map((c) => `  ${c.sha.slice(0, 9)} ${c.subject}`));
  if (t.approval) head.push(`plan first: ${t.approval}`);
  if (t.waiting_on) head.push(`waiting on ${t.waiting_on}`);
  if (t.report) head.push("", `${t.report.status}: ${reportText(t.report)}`);
  if (t.brief) head.push("", t.brief);
  if (t.inbox.length) head.push("", "inbox:", ...t.inbox.map((m) => `  ${m.from} ${m.status}: ${m.text}`));
  return [...head, "", ...t.log.map((e) => `${new Date(e.at).toISOString()} ${e.by}: ${e.text}`)].join("\n");
}

const VALUED = ["--brief", "--cwd", "--agent", "--detail", "--option"];

/** `--brief "- a list"` → `--brief=- a list`: parseArgs refuses a separate value that starts
 *  with a dash, and a brief or a report's detail often does. */
function joinValues(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--") return [...out, ...argv.slice(i)];
    const valued = VALUED.includes(argv[i]) && i + 1 < argv.length;
    out.push(valued ? `${argv[i]}=${argv[++i]}` : argv[i]);
  }
  return out;
}

export async function main(argv: string[], sys: Sys = realSys): Promise<string> {
  const { values: o, positionals: [cmd, ...a] } = parseArgs({
    args: joinValues(argv), allowPositionals: true, strict: true,
    options: { brief: { type: "string" }, cwd: { type: "string" }, agent: { type: "string" }, detail: { type: "string" }, option: { type: "string", multiple: true }, json: { type: "boolean" }, "auto-land": { type: "boolean" }, plan: { type: "boolean" }, force: { type: "boolean" }, help: { type: "boolean", short: "h" } },
  });
  const b = new Board(sys);
  const need = (n: number, usage: string) => { if (a.length < n) throw new Error(`usage: board ${usage}`); };
  const task = (t: Task) => (o.json ? JSON.stringify(t) : line(t));
  switch (o.help ? "help" : cmd) {
    case "add": need(1, `add "<title>"`); return task(await b.add({ title: a.join(" "), brief: o.brief, cwd: o.cwd, agent: o.agent, auto_land: o["auto-land"], plan_first: o.plan }));
    case "sub": need(1, `sub "<title>"`); return task(await b.sub({ title: a.join(" "), brief: o.brief, cwd: o.cwd, agent: o.agent }));
    case "fork": need(1, "fork <id>"); return task(await b.fork(a[0], { title: a.slice(1).join(" "), brief: o.brief, agent: o.agent, auto_land: o["auto-land"], plan_first: o.plan }));
    case "assign": need(2, "assign <id> <agent>"); return task(await b.assign(a[0], a[1]));
    case "open": need(1, "open <id>"); return (await b.open(a[0])).assignee!.terminal!;
    case "stop": need(1, "stop <id>"); return task(await b.stop(a[0]));
    case "phase": {
      need(1, "phase [<id>] <phase> [note]");
      const [id, rest] = isId(a[0]) ? [a[0], a.slice(1)] : [undefined, a];
      if (!rest.length) throw new Error("usage: board phase [<id>] <phase> [note]");
      return task(await b.phase(rest[0], rest.slice(1).join(" "), id));
    }
    case "report": need(2, "report <status> <headline>"); return task(await b.report(a[0], a.slice(1).join(" "), { detail: o.detail, options: o.option }));
    case "answer": need(2, "answer <id> <text>"); return task(await b.answer(a[0], a.slice(1).join(" ")));
    case "approve": need(1, "approve <id>"); return task(await b.approve(a[0]));
    case "land": need(1, "land <id>"); return task(await b.land(a[0]));
    case "rm": need(1, "rm <id>"); return `removed ${(await b.remove(a[0], o.force)).join(", ")}`;
    case "me": {
      const me = await b.self();
      if (!me) throw new Error("this terminal works no board task");
      return o.json ? JSON.stringify(me) : show(me);
    }
    case "show": { need(1, "show <id>"); const t = await b.store.get(a[0]); return o.json ? JSON.stringify(t) : show(t); }
    case "ls": case undefined: {
      const all = await b.store.list();
      return o.json ? JSON.stringify(all) : all.map(line).join("\n") || "no tasks";
    }
    case "ui": {
      const r = await sys.run(["herdr-app", "do", "tab.new", "--mod", "board", "--name", "Board"]);
      if (r.code !== 0) throw new Error(`herdr-app could not open the board: ${(r.err || r.out).trim()}`);
      return "board opened";
    }
    case "agents": return Object.keys(AGENTS).join("\n");
    case "help": return USAGE;
    default: throw new Error(`unknown command "${cmd}"\n\n${USAGE}`);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (out) => console.log(out),
    (e) => { console.error(`board: ${e instanceof Error ? e.message : e}`); process.exit(1); },
  );
}
