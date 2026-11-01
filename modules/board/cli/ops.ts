// Board operations. Root tasks come from the person; an agent working a task only makes sub-tasks
// of it, and every hand-back goes to the task's creator: the parent's agent, or the person (who
// sees it on the board).
import { agentSpec } from "./agents";
import { APPROVED, gate, reviewing } from "./approval";
import { handBack, protocol } from "./protocol";
import { isReportStatus, parseReport, REPORTS, reportText } from "./report";
import { descendants, PHASES, Store, WORK_PHASES, type Phase, type Task } from "./store";
import { stateDir, type Sys } from "./sys";
import { Terminals } from "./terminal";
import { Git, workdir } from "./worktree";
import { join, resolve } from "node:path";

export interface NewTask { title: string; brief?: string; cwd?: string; agent?: string; auto_land?: boolean; plan_first?: boolean }
export type Fork = Omit<NewTask, "cwd" | "title"> & { title?: string };

/** Phases where the task's work is over: its agent ends, its session stays resumable. */
const ENDED: readonly Phase[] = ["done", "failed"];

export class Board {
  readonly store: Store;
  readonly terms: Terminals;
  readonly git: Git;

  constructor(readonly sys: Sys) {
    this.store = new Store(join(stateDir(sys.env), "tasks"));
    this.terms = new Terminals(sys);
    this.git = new Git(sys);
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

  private async requirePerson(what: string) {
    const me = await this.self();
    if (me) throw new Error(`you are working ${me.id}: \`board ${what}\` is for the person; make a sub-task with \`board sub\``);
  }

  async add(n: NewTask): Promise<Task> {
    await this.requirePerson("add");
    return this.make(n, null, "user", resolve(this.sys.cwd(), n.cwd ?? "."));
  }

  /** A new root task that follows up on `id`, in its folder: its agent starts from a fork of
   *  `id`'s session (see `assign`). Defaults to `id`'s title and agent. */
  async fork(id: string, n: Fork): Promise<Task> {
    await this.requirePerson("fork");
    const from = await this.store.get(id);
    const agent = n.agent ?? from.assignee?.agent;
    const task = await this.make({ ...n, title: n.title?.trim() || from.title, agent }, null, "user", from.cwd, id);
    await this.update(id, "user", `forked into ${task.id}: ${task.title}`);
    return task;
  }

  async sub(n: NewTask): Promise<Task> {
    const me = await this.requireSelf("sub");
    // A sub-task's commits land in its parent's worktree, where the parent's agent reviews them.
    const task = await this.make({ ...n, auto_land: true, plan_first: false }, me.id, me.id, resolve(me.cwd, n.cwd ?? "."));
    await this.update(me.id, me.id, `made sub-task ${task.id}: ${task.title}`);
    return task;
  }

  private async make(n: NewTask, parent: string | null, creator: string, cwd: string, forked_from: string | null = null): Promise<Task> {
    if (!n.title.trim()) throw new Error("a task needs a title");
    if (n.agent) agentSpec(n.agent);
    if (!this.sys.isDir(cwd)) throw new Error(`no such folder: ${cwd}`);
    const task = await this.store.create({
      parent, forked_from, creator, cwd, title: n.title.trim(), brief: n.brief?.trim() ?? "", phase: "backlog", note: "",
      waiting_on: null, report: null, assignee: null, worktree: null, auto_land: n.auto_land ?? false, approval: n.plan_first ? "pending" : null, commits: [], inbox: [], log: [{ at: this.sys.now(), by: creator, text: "created" }],
    }, this.sys.now());
    return n.agent ? this.assign(task.id, n.agent) : task;
  }

  /** Starts a new session of `agent` on the task with its brief and the board protocol. A
   *  follow-up task's agent forks its source's session when it is the same agent and the CLI can;
   *  otherwise it starts fresh and the prompt carries the source's report. */
  async assign(id: string, agent: string): Promise<Task> {
    const spec = agentSpec(agent);
    const old = await this.store.get(id);
    if (await this.terms.alive(old.assignee?.terminal ?? null))
      throw new Error(`${id} already runs in ${old.assignee!.terminal}; stop it first`);
    const all = await this.store.list();
    const task = await this.checkout(old, all);
    const parent = all.find((t) => t.id === task.parent) ?? null;
    const source = all.find((t) => t.id === task.forked_from) ?? null;
    const session = spec.newSession(this.sys.uuid());
    const forks = source?.assignee?.agent === agent && spec.fork;
    const prompt = protocol(task, parent, source, Boolean(forks));
    const argv = forks ? spec.fork!(source!.assignee!.session, session, prompt) : spec.start(session, prompt);
    const terminal = await this.terms.spawn(task, argv, workdir(task));
    const how = forks ? ` from a fork of ${source!.id}` : "";
    return this.update(id, "user", `assigned to ${agent}${how} (${terminal})`, (t) => ({
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
    if (task.worktree && ENDED.includes(task.phase))
      throw new Error(`${id}'s worktree went when it ended; its commits are on its card, \`board fork ${id}\` follows it up`);
    const ready = await this.checkout(task, await this.store.list());
    const prompt = task.inbox.map((m) => handBack(m.from, m.status, m.text)).join("\n") || undefined;
    const terminal = await this.terms.spawn(ready, agentSpec(a.agent).resume(a.session, prompt), workdir(ready));
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

  /** `id` given: the person (or the board) moves that card to any phase; done or failed ends its
   *  agent. Otherwise the calling agent moves its own card to a working phase. */
  async phase(phase: string, note = "", id?: string): Promise<Task> {
    const me = id ? null : await this.requireSelf("phase");
    const allowed: readonly string[] = me ? WORK_PHASES : PHASES;
    if (!allowed.includes(phase)) throw new Error(`phase must be one of: ${allowed.join(", ")}`);
    const target = id ?? me!.id;
    if (me) gate(me, phase);
    if (id && phase === "done" && (await this.git.unlanded((await this.store.get(id)).worktree)))
      throw new Error(`${id} has work that has not landed: \`board land ${id}\` once its agent reported done, or move it to failed to drop it`);
    const task = await this.update(target, me?.id ?? "user", `${phase}${note ? `: ${note}` : ""}`, (t) => ({
      phase: phase as Phase,
      note,
      waiting_on: phase === "waiting" ? t.waiting_on ?? t.creator : null,
      report: null,
    }));
    return ENDED.includes(task.phase) ? this.end(task) : task;
  }

  async report(status: string, text: string, more: { detail?: string; options?: string[] } = {}): Promise<Task> {
    if (!isReportStatus(status)) throw new Error(`report must be one of: ${Object.keys(REPORTS).join(", ")}`);
    const me = await this.requireSelf("report");
    gate(me, status);
    const report = parseReport(status, text, this.sys.now(), more);
    const w = status === "done" ? me.worktree : null;
    const commits = w ? await this.git.ready(w) : me.commits;
    if (w && me.auto_land) await this.git.land(w);
    // Done with commits for the person to land: the card waits for them, the agent stays.
    const phase = w && !me.auto_land && commits.length ? "waiting" : REPORTS[status];
    const task = await this.update(me.id, me.id, `${status}: ${report.headline}`, () => ({
      phase, note: report.headline, report, commits, waiting_on: phase === "waiting" ? (w ? "user" : me.creator) : null,
    }));
    if (task.creator !== "user") await this.deliver(task.creator, task.id, status, reportText(report));
    return ENDED.includes(task.phase) ? this.end(task) : task;
  }

  /** The task's work is over: its agent ends (after the turn it is in, when it is the caller),
   *  and its session stays for `open` or a `fork`. */
  private async end(task: Task): Promise<Task> {
    if (task.worktree && this.git.exists(task.worktree)) {
      await this.git.remove(task.worktree);
      task = await this.update(task.id, "board", `${task.phase}: worktree ${task.worktree.branch} removed`);
    }
    const terminal = task.assignee?.terminal ?? null;
    if (!(await this.terms.alive(terminal))) return task;
    if (terminal === this.sys.env.HC_TERMINAL_ID) this.terms.killAfterTurn(terminal!);
    else await this.terms.kill(terminal);
    return this.update(task.id, "board", `${task.phase}: agent ended`, (t) => ({ assignee: t.assignee && { ...t.assignee, terminal: null } }));
  }

  /** The person lands a task's commits on its target's branch. When the target moved on (or the
   *  worktree changed) its agent is asked to rebase and report again; the person resolves nothing. */
  async land(id: string): Promise<Task> {
    await this.requirePerson("land");
    const task = await this.store.get(id);
    const w = task.worktree;
    if (!w || !this.git.exists(w) || task.phase !== "waiting" || task.report?.status !== "done")
      throw new Error(`${id} has nothing to land: its agent has not reported done from a worktree`);
    const r = await this.git.readiness(w);
    if (r.behind || r.dirty.length) {
      const why = r.behind ? `${w.target} moved on` : `your worktree has uncommitted changes (${r.dirty.join(", ")})`;
      await this.deliver(id, "user", "land", `${why}: rebase onto ${r.head}, rerun the checks and report done again`);
      return this.update(id, "user", `land: ${why}; sent back to its agent`, () => ({ phase: "work", waiting_on: null, report: null }));
    }
    await this.git.land(w);
    const done = await this.update(id, "user", `landed ${r.commits.length} commit(s) on ${w.target}`, () => ({ phase: "done", waiting_on: null, commits: r.commits }));
    return this.end(done);
  }

  /** The person approves the plan a plan-first task's agent reported: it starts the work. */
  async approve(id: string): Promise<Task> {
    await this.requirePerson("approve");
    if (!reviewing(await this.store.get(id))) throw new Error(`${id} has no plan to approve: its agent has not reported one`);
    await this.deliver(id, "user", "approve", APPROVED);
    return this.update(id, "user", "plan approved", () => ({ approval: "approved", phase: "work", waiting_on: null, report: null }));
  }

  /** The task's worktree when its folder is in git, made on first need and kept on the task. */
  private async checkout(task: Task, all: Task[]): Promise<Task> {
    const w = await this.git.checkout(task, all);
    if (!w || w === task.worktree) return task;
    return this.update(task.id, "board", `worktree ${w.path} on ${w.branch} from ${w.target}`, () => ({ worktree: w }));
  }

  /** An answer to a waiting task, from its creator's agent or the person. */
  async answer(id: string, text: string): Promise<Task> {
    if (!text.trim()) throw new Error("an answer needs text");
    const from = (await this.self())?.id ?? "user";
    await this.deliver(id, from, "answer", text);
    return this.update(id, from, `answer: ${text}`, (t) => ({
      // Changes asked for a plan send its agent back to planning.
      phase: t.phase !== "waiting" ? t.phase : reviewing(t) ? "plan" : "work",
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

  /** Removes the task and its sub-tasks, stopping their agents and dropping their worktrees;
   *  work that has not landed needs `force`. */
  async remove(id: string, force = false): Promise<string[]> {
    const all = await this.store.list();
    const gone = [...descendants(all, id), await this.store.get(id)];
    for (const t of gone) if (!force && (await this.git.unlanded(t.worktree))) throw new Error(`${t.id} has work that has not landed; \`board rm ${id} --force\` drops it`);
    for (const t of gone) {
      await this.terms.kill(t.assignee?.terminal ?? null);
      if (t.worktree) await this.git.remove(t.worktree);
      await this.store.remove(t.id);
    }
    return gone.map((t) => t.id);
  }
}
