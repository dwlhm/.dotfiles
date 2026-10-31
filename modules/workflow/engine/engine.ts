// Task lifecycle: submit → plan steps → dispatch each step whose inputs are ready on the cheapest
// eligible runner → report or infra → fallback → advance → close. One writer (this class);
// terminals are asked for, never mirrored. A step's result text lives in its run's report.md.
import { mkdirSync, writeFileSync } from "node:fs";
import type { Active, Deps, Result, Submit } from "./types";
import { join } from "node:path";
import { terminalName } from "./host";
import type { Task, Step, Run } from "./records";
import { choices, type Choice } from "./runners";
import { runId } from "./ids";
import { announce } from "./osc";
import { wfEnv } from "./paths";
import { resolveTarget } from "./targets";
import { available, edits, enoughInput, laterWith, needs, planSteps, resultOf, why, type Finished } from "./plans";
import { nextChoice } from "./retry";
import { assignPatch, landStep, preparePatch, workdir } from "./patch";
import { recordReport } from "./facts";
import { finishedOf } from "./results";
import { ended, flat } from "./steps";
import { splitStep } from "./split";
import { writeState } from "./state";
import { compose, type Composed } from "./compose";
import { acceptPlan, finalCheck, nextMilestone, setOptions, workSteps } from "./build";



const firstLine = (t: string) => (t.trim().split("\n")[0] ?? "").slice(0, 200);

export class Engine {
  readonly active = new Map<string, Active>();
  /** Open tasks (running, waiting for approval, blocked): what approve and tell act on. */
  readonly tasks = new Map<string, Task>();
  private waiters = new Map<string, ((r: Result) => void)[]>();
  /** The last status sequence written (osc.ts `announce`), so an unchanged one is not repeated. */
  reported = "";

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
    if (patch) s = { ...s, options: { ...s.options, root: patch.root, base: patch.base, check: patch.check } };
    const steps = planSteps(this.d.spec, this.d.runners, cmd, this.d.store.peekId(), s.goal, wanted);
    if (patch) await assignPatch(this.d.spec, steps, patch, this.d.state, this.d.exec);
    const id = this.d.store.nextId();
    s = { ...s, options: { ...s.options, engine: this.d.state } }; // its owner: only it recovers the task
    // A PR's diff is third-party and can be large: runtime state, never the brain record.
    if (target) writeState(this.d.state, id, "target.md", target.text);
    const task: Task = { id, command: s.command, goal: s.goal, folder: s.folder, options: s.options, status: "running", created: this.stamp(), closed: null, steps, answers: [] };
    this.tasks.set(id, task);
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

  /** Start every step whose inputs are ready, then report the aggregate that may have changed. */
  advance(task: Task): void {
    this.plan(task);
    announce(this);
  }

  /** Dispatch whatever is ready; close the task when nothing is left to run. */
  private plan(task: Task): void {
    // A paused or unapproved task dispatches nothing new; its runs are still reconciled.
    if (task.status === "paused" || task.status === "awaiting_approval" || task.status === "stopped") return void this.d.store.save(task);
    const work = workSteps(this, task);
    const workDone = work.length > 0 && work.every((s) => ended(s) !== null);
    if (task.status === "running" && workDone) nextMilestone(this, task);
    // Several patch steps each passed alone: they are proven together on the integration branch
    // before anything after the work (the curator) may treat them as verified.
    const patched = flat(work).filter((s) => s.worktree && s.status === "done").length;
    const together = workDone && !task.options["no-merge"] && patched > 1;
    const hold = together && task.options.final_check !== "passed";
    const all = flat(task.steps);
    for (const step of all.filter((s) => s.status === "queued")) {
      if (hold && this.d.spec.roles.get(step.role)!.after) continue;
      const deps = all.filter((s) => step.deps.includes(s.id));
      if (!deps.every((s) => ended(s) !== null)) continue;
      if (deps.length && !enoughInput(this.cmd(task), finishedOf(this.d.state, task, step.deps))) step.status = "stopped";
      else this.dispatch(task, step);
    }
    if (all.some((s) => s.status === "running" || s.status === "paused") || task.status !== "running") return void this.d.store.save(task);
    if (hold) {
      if (task.options.final_check !== "running") (setOptions(task, { final_check: "running" }), void finalCheck(this, task));
      return void this.d.store.save(task);
    }
    if (all.some((s) => s.status === "queued")) return void this.d.store.save(task);
    const roles = [...this.d.spec.roles.values()];
    const after = new Set(roles.filter((r) => r.after).map((r) => r.name));
    const planner = new Set(roles.filter((r) => r.writes === "plan").map((r) => r.name));
    const r = resultOf(this.cmd(task), task.steps, new Map(finishedOf(this.d.state, task).map((f) => [f.step.id, f])), after, planner);
    this.close(task, r.status, r.text);
  }

  dispatch(task: Task, step: Step): void {
    const next = nextChoice(this.choicesFor(task, step), step.runs, this.d.spec.vocab.tiers, this.d.spec.policy.limits.retries_per_tier);
    if (!next) {
      step.status = "failed";
      this.d.log(`${step.id} failed: ${why(step)}`);
      return;
    }
    const id = runId(step.id, step.runs.length + 1);
    let composed: Composed;
    try {
      composed = compose(this, task, step, id, next.runner.multiline);
    } catch (e) {
      step.status = "failed";
      return void this.d.log(`${step.id} failed: cannot build its prompt: ${(e as Error).message}`);
    }
    const { prompt, context } = composed;
    const run: Run = { id, runner: next.runner.name, model: next.model.id, terminal: null, started: this.stamp(), ended: null, outcome: null };
    step.runs.push(run);
    step.status = "running";
    // What private context this run saw, on disk from the start: the leak check compares the patch
    // against it, including after a restart (a later run continues this run's worktree).
    mkdirSync(join(this.d.state, "runs", id), { recursive: true });
    writeFileSync(join(this.d.state, "runs", id, "context.md"), context);
    this.active.set(id, { task, step, run, working: false, nudged: 0 });
    void this.spawn(this.active.get(id)!, next, prompt);
  }

  private async spawn(a: Active, c: Choice, prompt: string): Promise<void> {
    const role = this.d.spec.roles.get(a.step.role)!;
    let cwd: string;
    try {
      cwd = await workdir(this.d.spec, a.task, a.step, this.d.exec);
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
    const role = this.d.spec.roles.get(a.step.role)!;
    if (outcome === "done" && role.writes === "knowledge") text = await recordReport(this.d.knowledge, text, { folder: a.task.folder, source: a.run.id, date: this.stamp().slice(0, 10) });
    const plan = outcome === "done" && role.writes === "plan" ? await acceptPlan(this, a, text) : undefined;
    if (plan && !plan.ok) ({ outcome, text } = { outcome: "fail", text: plan.reason });
    const split = outcome === "too_big" && a.step.worktree ? await splitStep(this, a, text) : undefined;
    if (split) ({ outcome, text } = split.ok ? { outcome, text: split.text } : { outcome: split.outcome, text: split.reason });
    writeFileSync(join(dir, "report.md"), text);
    Object.assign(a.run, { ended: this.stamp(), outcome: outcome === "blocked" ? "stuck" : outcome, summary: firstLine(text) });
    this.d.log(`${a.run.id} ${outcome}: ${firstLine(text)}`);
    const { task, step } = a;
    const cmd = this.cmd(task);
    if (outcome === "infra" || outcome === "fail") this.dispatch(task, step);
    else if (outcome === "done") step.status = "done";
    else if (split?.ok) step.status = "split"; // its sub-steps carry on
    else if ((cmd.many && step.role === cmd.roles[0]) || role.after) step.status = "failed"; // drops out, never blocks
    else return this.close(task, "blocked", text, step);
    if (plan?.ok && plan.waiting) return this.close(task, "awaiting_approval", plan.text);
    this.advance(task);
  }

  close(task: Task, status: "done" | "failed" | "blocked" | "stopped" | "awaiting_approval", text: string, waiting?: Step): void {
    if (waiting) waiting.status = "paused";
    task.status = status;
    const final = status === "done" || status === "failed" || status === "stopped";
    task.closed = final ? this.stamp() : null;
    if (final) this.tasks.delete(task.id);
    const approval = `Plan — approve it: wf approve ${task.id} · change it: wf tell ${task.id} "…"`;
    const title = { done: this.cmd(task).many ? "Report" : "Answer", failed: "Failed", blocked: "Needs you", stopped: "Stopped", awaiting_approval: approval }[status];
    this.d.store.save(task, `# ${task.goal}\n\n## ${title}\n\n${text.trim()}`);
    void this.d.store.commit(task);
    this.d.log(`${task.id} ${status}`);
    const to = task.options["report-to"];
    if (typeof to === "string") void this.d.host.send(to, `<wf from="${task.id}" status="${status}">\n${text.trim()}\n</wf>`).catch(() => {});
    for (const w of this.waiters.get(task.id) ?? []) w({ task, text: text.trim() });
    this.waiters.delete(task.id);
    announce(this);
  }

  /** Resolves when the task leaves `running` (done, failed or blocked), with its result text. */
  wait(task: Task): Promise<Result> {
    if (task.status !== "running") return Promise.resolve({ task, text: this.d.store.body(task.id) });
    return new Promise((resolve) => this.waiters.set(task.id, [...(this.waiters.get(task.id) ?? []), resolve]));
  }

  /** After a restart: runs the old engine left open died with it (they were its children). */
  async recover(): Promise<void> {
    const all = this.d.store.open(); // a brain may be shared by engines with other state folders
    const open = all.filter((t) => t.options.engine === this.d.state);
    if (all.length > open.length) this.d.log(`${all.length - open.length} open task(s) belong to another engine; left alone`);
    for (const task of open) this.tasks.set(task.id, task);
    for (const task of open.filter((t) => t.status === "running")) {
      const open = flat(task.steps).flatMap((step) => step.runs.filter((r) => r.ended === null).map((run) => ({ step, run })));
      for (const { step, run } of open) {
        const a: Active = { task, step, run, working: false, nudged: 0 };
        this.active.set(run.id, a);
        await this.finish(a, "infra", "the engine restarted while this run was open");
      }
      if (!open.length) this.advance(task);
    }
  }
}
