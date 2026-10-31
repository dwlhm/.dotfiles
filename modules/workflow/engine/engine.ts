// Task lifecycle: submit → dispatch a run on the cheapest eligible runner → report or infra →
// fallback → close. One writer (this class); terminals are asked for, never mirrored.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Spec } from "./spec";
import type { Command } from "./commands";
import type { Host } from "./host";
import { terminalName } from "./host";
import type { Knowledge } from "./knowledge";
import type { Store } from "./store";
import type { Task, Step, Run } from "./records";
import { choices, type Choice, type Runner } from "./runners";
import { renderPrompt, type Vars } from "./prompt";
import { runId, stepId } from "./ids";
import { wfEnv } from "./paths";

export type Deps = {
  spec: Spec;
  runners: Map<string, Runner>;
  host: Host;
  store: Store;
  knowledge: Knowledge;
  state: string;
  now: () => Date;
  log: (line: string) => void;
};
export type Active = { task: Task; step: Step; run: Run; working: boolean; nudged: number };
export type Result = { task: Task; text: string };
export type Submit = { command: string; goal: string; folder: string; options: Record<string, unknown> };

/** Commands this engine can run so far: one role, one runner, an answer. */
export const available = (c: Command): boolean => c.roles.length === 1 && !c.many && c.result === "answer";

const firstLine = (t: string) => (t.trim().split("\n")[0] ?? "").slice(0, 200);

export class Engine {
  readonly active = new Map<string, Active>();
  private waiters = new Map<string, ((r: Result) => void)[]>();

  constructor(readonly d: Deps) {}

  private stamp = () => this.d.now().toISOString().replace(/\.\d{3}Z$/, "Z");

  submit(s: Submit): Task {
    const cmd = this.d.spec.commands.get(s.command);
    if (!cmd) throw new Error(`unknown command '${s.command}'`);
    if (!available(cmd)) throw new Error(`'${s.command}' is not available yet`);
    for (const name of (s.options.with as string[] | undefined) ?? []) {
      if (!this.d.runners.has(name)) throw new Error(`unknown agent '${name}' (known: ${[...this.d.runners.keys()].join(", ")})`);
    }
    const role = this.d.spec.roles.get(cmd.roles[0])!;
    if (!choices(role, this.d.runners, this.d.spec.vocab.tiers, (s.options.with as string[]) ?? []).length) {
      throw new Error(`no ${(s.options.with as string[])?.join("/") || "agent"} can do '${s.command}' (it needs: ${role.can.join(", ")})`);
    }
    const id = this.d.store.nextId();
    const step: Step = { id: stepId(Number(id.slice(1)), [1]), title: s.goal, role: cmd.roles[0], only: [], deps: [], status: "queued", runs: [], steps: [] };
    const task: Task = { id, command: s.command, goal: s.goal, folder: s.folder, options: s.options, status: "running", created: this.stamp(), closed: null, steps: [step], answers: [] };
    this.d.store.save(task, `# ${s.goal}`);
    void this.d.store.commit(task);
    this.d.log(`${id} ${s.command}: ${s.goal}`);
    this.dispatch(task, step);
    return task;
  }

  /** The runs a step may still try, in order: eligible choices not yet used by an earlier run. */
  remaining(task: Task, step: Step): Choice[] {
    const role = this.d.spec.roles.get(step.role)!;
    const tried = new Set(step.runs.map((r) => `${r.runner} ${r.model}`));
    const only = (task.options.with as string[] | undefined) ?? [];
    return choices(role, this.d.runners, this.d.spec.vocab.tiers, only).filter((c) => !tried.has(`${c.runner.name} ${c.model.id}`));
  }

  vars(task: Task): Vars {
    return { question: task.goal, about: (task.options.about as string[] | undefined) ?? ["the whole folder"], goal: task.goal };
  }

  dispatch(task: Task, step: Step): void {
    const next = this.remaining(task, step)[0];
    if (!next) {
      const why = step.runs.map((r) => `${r.runner}·${r.model}: ${r.summary ?? r.outcome}`).join("; ");
      return void this.close(task, step, "failed", `No runner left for this step.${why ? ` Tried: ${why}` : ""}`);
    }
    const role = this.d.spec.roles.get(step.role)!;
    const id = runId(step.id, step.runs.length + 1);
    const context = this.d.knowledge.context({ folder: task.folder, paths: (task.options.about as string[]) ?? [], goal: task.goal, budget: this.d.spec.policy.limits.context_bytes });
    const prompt = renderPrompt({ role, vocab: this.d.spec.vocab, vars: this.vars(task), context, run: id });
    const run: Run = { id, runner: next.runner.name, model: next.model.id, terminal: null, started: this.stamp(), ended: null, outcome: null };
    step.runs.push(run);
    step.status = "running";
    this.active.set(id, { task, step, run, working: false, nudged: 0 });
    void this.spawn(this.active.get(id)!, next, prompt);
  }

  private async spawn(a: Active, c: Choice, prompt: string): Promise<void> {
    const role = this.d.spec.roles.get(a.step.role)!;
    try {
      if (c.runner.trust) await c.runner.code.trust!(a.task.folder);
      const l = c.runner.code.launch({ model: c.model.id, prompt, can: role.can, check: a.step.check });
      const env = { ...wfEnv(), ...l.env };
      a.run.terminal = await this.d.host.spawn({ name: terminalName(a.run.id), cwd: a.task.folder, argv: l.argv, env, labels: { "wf.run": a.run.id } });
      this.d.store.save(a.task);
      this.d.log(`${a.run.id} ${c.runner.name}·${c.model.id} on ${a.run.terminal}`);
    } catch (e) {
      await this.finish(a, "infra", `could not start: ${(e as Error).message}`);
    }
  }

  /** A worker's `wf report`. Errors are for the worker: they say what to fix. */
  async report(id: string, outcome: string, text: string): Promise<void> {
    const a = this.active.get(id);
    if (!a) throw new Error(`run ${id} is not active (finished, stopped or unknown)`);
    const role = this.d.spec.roles.get(a.step.role)!;
    if (!role.reports.includes(outcome)) throw new Error(`'${outcome}' is not an outcome this role reports (${role.reports.join(", ")})`);
    if (!text.trim()) throw new Error("the report text is empty");
    await this.finish(a, outcome, text);
  }

  /** End a run: keep its screen, close its terminal, then move the step on. */
  async finish(a: Active, outcome: string, text: string): Promise<void> {
    if (!this.active.delete(a.run.id)) return;
    const dir = join(this.d.state, "runs", a.run.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "report.md"), text);
    if (a.run.terminal) {
      writeFileSync(join(dir, "screen.txt"), await this.d.host.snapshot(a.run.terminal, 200).catch(() => ""));
      await this.d.host.close(a.run.terminal).catch(() => {});
    }
    Object.assign(a.run, { ended: this.stamp(), outcome, summary: firstLine(text) });
    this.d.log(`${a.run.id} ${outcome}: ${firstLine(text)}`);
    if (outcome === "infra") return this.dispatch(a.task, a.step);
    if (outcome === "done") return this.close(a.task, a.step, "done", text);
    this.close(a.task, a.step, "blocked", text);
  }

  close(task: Task, step: Step, status: "done" | "failed" | "blocked", text: string): void {
    step.status = status === "blocked" ? "paused" : status;
    task.status = status;
    task.closed = status === "blocked" ? null : this.stamp();
    const title = { done: "Answer", failed: "Failed", blocked: "Needs you" }[status];
    this.d.store.save(task, `# ${task.goal}\n\n## ${title}\n\n${text.trim()}`);
    void this.d.store.commit(task);
    this.d.log(`${task.id} ${status}`);
    const to = task.options["report-to"];
    if (typeof to === "string") void this.d.host.send(to, `<wf from="${task.id}" status="${status}">\n${text.trim()}\n</wf>`).catch(() => {});
    for (const w of this.waiters.get(task.id) ?? []) w({ task, text: text.trim() });
    this.waiters.delete(task.id);
  }

  /** Resolves when the task leaves `running` (done, failed or blocked), with its result text. */
  wait(task: Task): Promise<Result> {
    if (task.status !== "running") return Promise.resolve({ task, text: this.d.store.body(task.id) });
    return new Promise((resolve) => this.waiters.set(task.id, [...(this.waiters.get(task.id) ?? []), resolve]));
  }

  /** After a restart: runs the old engine left open died with it (they were its children). */
  async recover(): Promise<void> {
    for (const task of this.d.store.open().filter((t) => t.status === "running")) {
      for (const step of task.steps.filter((s) => s.status === "running")) {
        const open = step.runs.find((r) => r.ended === null);
        if (!open) {
          this.dispatch(task, step);
          continue;
        }
        const a: Active = { task, step, run: open, working: false, nudged: 0 };
        this.active.set(open.id, a);
        await this.finish(a, "infra", "the engine restarted while this run was open");
      }
    }
  }
}
