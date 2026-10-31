// Task lifecycle: submit → plan steps → dispatch each step whose inputs are ready on the cheapest
// eligible runner → report or infra → fallback → advance → close. One writer (this class);
// terminals are asked for, never mirrored. A step's result text lives in its run's report.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Spec } from "./spec";
import type { Host } from "./host";
import { terminalName } from "./host";
import type { Knowledge } from "./knowledge";
import type { Store } from "./store";
import type { Task, Step, Run } from "./records";
import { choices, type Choice, type Runner } from "./runners";
import { renderPrompt } from "./prompt";
import { runId } from "./ids";
import { wfEnv } from "./paths";
import { resolveTarget } from "./targets";
import type { Exec } from "./exec";
import { available, edits, enoughInput, laterWith, needs, planSteps, resultOf, varsFor, why, type Finished } from "./plans";
import { nextChoice } from "./retry";
import { assignPatch, landStep, preparePatch, workdir } from "./patch";

export type Deps = {
  spec: Spec;
  runners: Map<string, Runner>;
  host: Host;
  store: Store;
  knowledge: Knowledge;
  state: string;
  now: () => Date;
  log: (line: string) => void;
  /** Runs git and gh for resolving review targets (a fake in tests). */
  exec?: Exec;
};
export type Active = { task: Task; step: Step; run: Run; working: boolean; nudged: number };
export type Result = { task: Task; text: string };
export type Submit = { command: string; goal: string; folder: string; options: Record<string, unknown> };

const ENDED = ["done", "failed", "stopped"];

/** Per-task runtime files (`<state>/tasks/<id>/`): inputs that must not go into the record. */
function writeState(state: string, id: string, name: string, text: string): void {
  mkdirSync(join(state, "tasks", id), { recursive: true });
  writeFileSync(join(state, "tasks", id, name), text);
}
function readState(state: string, id: string, name: string): string | undefined {
  const f = join(state, "tasks", id, name);
  return existsSync(f) ? readFileSync(f, "utf8") : undefined;
}
const firstLine = (t: string) => (t.trim().split("\n")[0] ?? "").slice(0, 200);

export class Engine {
  readonly active = new Map<string, Active>();
  private waiters = new Map<string, ((r: Result) => void)[]>();

  constructor(readonly d: Deps) {}

  private stamp = () => this.d.now().toISOString().replace(/\.\d{3}Z$/, "Z");
  private cmd = (task: Task) => this.d.spec.commands.get(task.command)!;

  async submit(s: Submit): Promise<Task> {
    const cmd = this.d.spec.commands.get(s.command);
    if (!cmd) throw new Error(`unknown command '${s.command}'`);
    if (!available(this.d.spec, cmd)) throw new Error(`'${s.command}' is not available yet`);
    const wanted = (s.options.with as string[] | undefined) ?? [];
    const target = needs(this.d.spec, cmd, "target") ? await resolveTarget(s.goal, s.folder, this.d.exec) : undefined;
    if (target) s = { ...s, options: { ...s.options, target_label: target.label } };
    const patch = cmd.roles.some((r) => edits(this.d.spec, r)) ? await preparePatch(this.d.spec, s, this.d.exec) : undefined;
    if (patch) s = { ...s, options: { ...s.options, root: patch.root, base: patch.base } };
    const steps = planSteps(this.d.spec, this.d.runners, cmd, this.d.store.peekId(), s.goal, wanted);
    if (patch) await assignPatch(this.d.spec, steps, patch, this.d.state, this.d.exec);
    const id = this.d.store.nextId();
    // A PR's diff is third-party and can be large: runtime state, never the brain record.
    if (target) writeState(this.d.state, id, "target.md", target.text);
    const task: Task = { id, command: s.command, goal: s.goal, folder: s.folder, options: s.options, status: "running", created: this.stamp(), closed: null, steps, answers: [] };
    this.d.store.save(task, `# ${s.goal}`);
    void this.d.store.commit(task);
    this.d.log(`${id} ${s.command}: ${s.goal}`);
    this.advance(task);
    return task;
  }

  /** Every runner+model a step may use, cheapest first. */
  choicesFor(task: Task, step: Step): Choice[] {
    const role = this.d.spec.roles.get(step.role)!;
    const only = step.with ?? laterWith(this.cmd(task), (task.options.with as string[] | undefined) ?? []);
    return choices(role, this.d.runners, this.d.spec.vocab.tiers, only);
  }

  /** Finished steps (of `ids`, else all) with their result text, read back from the run artifacts. */
  finished(task: Task, ids?: string[]): Finished[] {
    return task.steps
      .filter((s) => s.status === "done" && (!ids || ids.includes(s.id)))
      .flatMap((step) => {
        const run = [...step.runs].reverse().find((r) => r.outcome === "done");
        const file = run && join(this.d.state, "runs", run.id, "report.md");
        return file && existsSync(file) ? [{ step, agent: run.runner, text: readFileSync(file, "utf8") }] : [];
      });
  }

  /** Start every step whose inputs are ready; close the task when nothing is left to run. */
  advance(task: Task): void {
    for (const step of task.steps.filter((s) => s.status === "queued")) {
      const deps = task.steps.filter((s) => step.deps.includes(s.id));
      if (!deps.every((s) => ENDED.includes(s.status))) continue;
      if (deps.length && !enoughInput(this.cmd(task), this.finished(task, step.deps))) step.status = "stopped";
      else this.dispatch(task, step);
    }
    if (task.steps.some((s) => s.status === "running" || s.status === "paused") || task.status !== "running") return void this.d.store.save(task);
    if (task.steps.some((s) => s.status === "queued")) return void this.d.store.save(task);
    const r = resultOf(this.cmd(task), task.steps, new Map(this.finished(task).map((f) => [f.step.id, f])));
    this.close(task, r.status, r.text);
  }

  dispatch(task: Task, step: Step): void {
    const next = nextChoice(this.choicesFor(task, step), step.runs, this.d.spec.vocab.tiers, this.d.spec.policy.limits.retries_per_tier);
    if (!next) {
      step.status = "failed";
      this.d.log(`${step.id} failed: ${why(step)}`);
      return;
    }
    const role = this.d.spec.roles.get(step.role)!;
    const id = runId(step.id, step.runs.length + 1);
    const context = this.d.knowledge.context({ folder: task.folder, paths: (task.options.about as string[]) ?? [], goal: task.goal, budget: this.d.spec.policy.limits.context_bytes });
    let prompt: string;
    try {
      const vars = varsFor(task, this.finished(task, step.deps), readState(this.d.state, task.id, "target.md"), step);
      const last = step.runs.at(-1);
      const feedback = last?.outcome === "fail" ? readFileSync(join(this.d.state, "runs", last.id, "report.md"), "utf8") : undefined;
      prompt = renderPrompt({ role, vocab: this.d.spec.vocab, vars, context, run: id, multiline: next.runner.multiline, feedback });
    } catch (e) {
      step.status = "failed";
      return void this.d.log(`${step.id} failed: cannot build its prompt: ${(e as Error).message}`);
    }
    const run: Run = { id, runner: next.runner.name, model: next.model.id, terminal: null, started: this.stamp(), ended: null, outcome: null };
    step.runs.push(run);
    step.status = "running";
    // What private context this run saw: the leak check compares the patch against it.
    mkdirSync(join(this.d.state, "runs", id), { recursive: true });
    writeFileSync(join(this.d.state, "runs", id, "context.md"), context.map((c) => c.text).join("\n\n"));
    this.active.set(id, { task, step, run, working: false, nudged: 0 });
    void this.spawn(this.active.get(id)!, next, prompt);
  }

  private async spawn(a: Active, c: Choice, prompt: string): Promise<void> {
    const role = this.d.spec.roles.get(a.step.role)!;
    let cwd: string;
    try {
      cwd = await workdir(a.task, a.step, this.d.exec);
    } catch (e) {
      // Fails the same way for every runner: the step stops here instead of trying them all.
      return this.abandon(a, `could not prepare its folder: ${(e as Error).message}`);
    }
    try {
      if (c.runner.trust) await c.runner.code.trust!(cwd);
      const l = c.runner.code.launch({ model: c.model.id, prompt, cwd, can: role.can, check: a.step.check });
      const env = { ...wfEnv(), ...l.env };
      a.run.terminal = await this.d.host.spawn({ name: terminalName(a.run.id), cwd, argv: l.argv, env, labels: { "wf.run": a.run.id } });
      this.d.store.save(a.task);
      this.d.log(`${a.run.id} ${c.runner.name}·${c.model.id} on ${a.run.terminal}`);
    } catch (e) {
      await this.finish(a, "infra", `could not start: ${(e as Error).message}`);
    }
  }

  /** End a run and its step for a reason no other runner would change. */
  private abandon(a: Active, reason: string): void {
    this.active.delete(a.run.id);
    Object.assign(a.run, { ended: this.stamp(), outcome: "infra", summary: firstLine(reason) });
    a.step.status = "failed";
    this.d.log(`${a.step.id} failed: ${reason}`);
    this.advance(a.task);
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

  /** End a run: keep its screen, close its terminal, then move the step and the task on. */
  async finish(a: Active, outcome: string, text: string): Promise<void> {
    if (!this.active.delete(a.run.id)) return;
    const dir = join(this.d.state, "runs", a.run.id);
    mkdirSync(dir, { recursive: true });
    if (a.run.terminal) {
      writeFileSync(join(dir, "screen.txt"), await this.d.host.snapshot(a.run.terminal, 200).catch(() => ""));
      await this.d.host.close(a.run.terminal).catch(() => {});
    }
    const landed = outcome === "done" && a.step.worktree ? await landStep(this.d.spec, this.d.state, a.task, a.step, this.d.exec) : undefined;
    if (landed) ({ outcome, text } = landed.ok ? { outcome, text: `${landed.text}\n\n${text.trim()}` } : { outcome: landed.outcome, text: landed.reason });
    writeFileSync(join(dir, "report.md"), text);
    Object.assign(a.run, { ended: this.stamp(), outcome: outcome === "blocked" ? "stuck" : outcome, summary: firstLine(text) });
    this.d.log(`${a.run.id} ${outcome}: ${firstLine(text)}`);
    const { task, step } = a;
    const cmd = this.cmd(task);
    if (outcome === "infra" || outcome === "fail") this.dispatch(task, step);
    else if (outcome === "done") step.status = "done";
    else if (cmd.many && step.role === cmd.roles[0]) step.status = "failed"; // one agent drops out
    else return this.close(task, "blocked", text, step);
    this.advance(task);
  }

  close(task: Task, status: "done" | "failed" | "blocked", text: string, waiting?: Step): void {
    if (waiting) waiting.status = "paused";
    task.status = status;
    task.closed = status === "blocked" ? null : this.stamp();
    const title = { done: this.cmd(task).many ? "Report" : "Answer", failed: "Failed", blocked: "Needs you" }[status];
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
      const open = task.steps.flatMap((step) => step.runs.filter((r) => r.ended === null).map((run) => ({ step, run })));
      for (const { step, run } of open) {
        const a: Active = { task, step, run, working: false, nudged: 0 };
        this.active.set(run.id, a);
        await this.finish(a, "infra", "the engine restarted while this run was open");
      }
      if (!open.length) this.advance(task);
    }
  }
}
