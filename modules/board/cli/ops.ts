// Board operations. Root tasks come from the person; an agent working a task only makes sub-tasks
// of it, and every hand-back goes to the task's creator: the parent's agent, or the person (who
// sees it on the board).
import { agentSpec } from "./agents";
import { handBack, protocol } from "./protocol";
import { isReportStatus, parseReport, REPORTS, reportText } from "./report";
import { descendants, PHASES, Store, WORK_PHASES, type Phase, type Task } from "./store";
import { stateDir, type Sys } from "./sys";
import { Terminals } from "./terminal";
import { join, resolve } from "node:path";

export interface NewTask { title: string; brief?: string; cwd?: string; agent?: string }

export class Board {
  readonly store: Store;
  readonly terms: Terminals;

  constructor(readonly sys: Sys) {
    this.store = new Store(join(stateDir(sys.env), "tasks"));
    this.terms = new Terminals(sys);
  }

  /** The task whose agent runs in the calling terminal, if any. */
  async self(): Promise<Task | null> {
    const me = this.sys.env.HC_TERMINAL_ID;
    if (!me) return null;
    return (await this.store.list()).find((t) => t.assignee?.terminal === me) ?? null;
  }

  private async requireSelf(what: string): Promise<Task> {
    const me = await this.self();
    if (!me) throw new Error(`\`board ${what}\` is for an agent working a board task; this terminal runs none`);
    return me;
  }

  private update(id: string, by: string, text: string, change: (t: Task) => Partial<Task> = () => ({})) {
    const at = this.sys.now();
    return this.store.update(id, at, (t) => ({ ...t, ...change(t), log: [...t.log, { at, by, text }] }));
  }

  async add(n: NewTask): Promise<Task> {
    const me = await this.self();
    if (me) throw new Error(`you are working ${me.id}: make a sub-task of it with \`board sub\``);
    return this.make(n, null, "user", resolve(this.sys.cwd(), n.cwd ?? "."));
  }

  async sub(n: NewTask): Promise<Task> {
    const me = await this.requireSelf("sub");
    const task = await this.make(n, me.id, me.id, resolve(me.cwd, n.cwd ?? "."));
    await this.update(me.id, me.id, `made sub-task ${task.id}: ${task.title}`);
    return task;
  }

  private async make(n: NewTask, parent: string | null, creator: string, cwd: string): Promise<Task> {
    if (!n.title.trim()) throw new Error("a task needs a title");
    if (n.agent) agentSpec(n.agent);
    if (!this.sys.isDir(cwd)) throw new Error(`no such folder: ${cwd}`);
    const task = await this.store.create({
      parent, creator, cwd, title: n.title.trim(), brief: n.brief?.trim() ?? "", phase: "backlog", note: "",
      waiting_on: null, report: null, assignee: null, inbox: [], log: [{ at: this.sys.now(), by: creator, text: "created" }],
    }, this.sys.now());
    return n.agent ? this.assign(task.id, n.agent) : task;
  }

  /** Starts a new session of `agent` on the task with its brief and the board protocol. */
  async assign(id: string, agent: string): Promise<Task> {
    const spec = agentSpec(agent);
    const task = await this.store.get(id);
    if (await this.terms.alive(task.assignee?.terminal ?? null))
      throw new Error(`${id} already runs in ${task.assignee!.terminal}; stop it first`);
    const parent = task.parent ? await this.store.get(task.parent) : null;
    const session = spec.newSession(this.sys.uuid());
    const terminal = await this.terms.spawn(task, spec.start(session, protocol(task, parent)));
    return this.update(id, "user", `assigned to ${agent} (${terminal})`, (t) => ({
      assignee: { agent, terminal, session },
      phase: t.phase === "backlog" ? "plan" : t.phase,
    }));
  }

  /** Makes sure the task's agent runs, resuming its session (with any waiting hand-backs as the
   *  first prompt) when it ended. Returns the terminal. */
  async open(id: string): Promise<Task> {
    const task = await this.store.get(id);
    const a = task.assignee;
    if (!a) throw new Error(`${id} has no agent yet: assign one`);
    if (await this.terms.alive(a.terminal)) return task;
    const prompt = task.inbox.map((m) => handBack(m.from, m.status, m.text)).join("\n") || undefined;
    const terminal = await this.terms.spawn(task, agentSpec(a.agent).resume(a.session, prompt));
    return this.update(id, "user", `resumed ${a.agent} (${terminal})`, () => ({
      assignee: { ...a, terminal },
      inbox: [],
    }));
  }

  async stop(id: string): Promise<Task> {
    const task = await this.store.get(id);
    await this.terms.kill(task.assignee?.terminal ?? null);
    return this.update(id, "user", "stopped", (t) => ({ assignee: t.assignee && { ...t.assignee, terminal: null } }));
  }

  /** `id` given: the person (or the board) moves that card to any phase. Otherwise the calling
   *  agent moves its own card to a working phase. */
  async phase(phase: string, note = "", id?: string): Promise<Task> {
    const me = id ? null : await this.requireSelf("phase");
    const allowed: readonly string[] = me ? WORK_PHASES : PHASES;
    if (!allowed.includes(phase)) throw new Error(`phase must be one of: ${allowed.join(", ")}`);
    const target = id ?? me!.id;
    return this.update(target, me?.id ?? "user", `${phase}${note ? `: ${note}` : ""}`, (t) => ({
      phase: phase as Phase,
      note,
      waiting_on: phase === "waiting" ? t.waiting_on ?? t.creator : null,
      report: null,
    }));
  }

  async report(status: string, text: string, more: { detail?: string; options?: string[] } = {}): Promise<Task> {
    if (!isReportStatus(status)) throw new Error(`report must be one of: ${Object.keys(REPORTS).join(", ")}`);
    const me = await this.requireSelf("report");
    const report = parseReport(status, text, this.sys.now(), more);
    const phase = REPORTS[status];
    const task = await this.update(me.id, me.id, `${status}: ${report.headline}`, () => ({
      phase, note: report.headline, report, waiting_on: phase === "waiting" ? me.creator : null,
    }));
    if (task.creator !== "user") await this.deliver(task.creator, task.id, status, reportText(report));
    return task;
  }

  /** An answer to a waiting task, from its creator's agent or the person. */
  async answer(id: string, text: string): Promise<Task> {
    if (!text.trim()) throw new Error("an answer needs text");
    const from = (await this.self())?.id ?? "user";
    await this.deliver(id, from, "answer", text);
    return this.update(id, from, `answer: ${text}`, (t) => ({
      phase: t.phase === "waiting" ? "work" : t.phase,
      waiting_on: null,
      report: t.phase === "waiting" ? null : t.report,
    }));
  }

  /** Types the message into the task's live agent, or keeps it in its inbox for the next open. */
  private async deliver(to: string, from: string, status: string, text: string) {
    const target = await this.store.get(to);
    const terminal = target.assignee?.terminal ?? null;
    if (await this.terms.alive(terminal)) return void (await this.terms.send(terminal!, handBack(from, status, text)));
    await this.store.update(to, this.sys.now(), (t) => ({
      ...t,
      assignee: t.assignee && { ...t.assignee, terminal: null },
      inbox: [...t.inbox, { from, status, text, at: this.sys.now() }],
    }));
  }

  /** Removes the task and its sub-tasks, stopping their agents. */
  async remove(id: string): Promise<string[]> {
    const all = await this.store.list();
    const gone = [...descendants(all, id), await this.store.get(id)];
    for (const t of gone) {
      await this.terms.kill(t.assignee?.terminal ?? null);
      await this.store.remove(t.id);
    }
    return gone.map((t) => t.id);
  }
}
