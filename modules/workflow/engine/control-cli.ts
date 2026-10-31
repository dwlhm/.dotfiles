// The CLI side of the control contract (README: "Control commands"): `status`, `show`, `watch`,
// `pause|resume|stop`, `tell`, `take`, `give back`, and `merge`, which needs no engine at all.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { UsageError } from "./args";
import { call, type Reply } from "./client";
import { exec, type Exec } from "./exec";
import { brainRoot, stateDir, VERSION } from "./paths";
import { mergeUserBranch, repoRoot } from "./repo";
import { select, type Picked } from "./select";
import { Store } from "./store";
import { flat } from "./steps";
import type { Run } from "./records";
import type { Spec } from "./spec";

/** What a command does: `engine/cli.ts` prints it; `watch` attaches to the terminal itself. */
export type Result = { code: number; out?: string; err?: string };

/** Exit codes: 0 done · 1 failed or error · 2 usage · 3 needs you (a question, a plan to approve). */
export const EXIT = { done: 0, failed: 1, blocked: 3, awaiting_approval: 3 } as Record<string, number>;

/** One engine request, injectable so the commands are testable without a live socket. */
export type Ask = (req: object) => Promise<Reply>;
export const ask: Ask = (req) => call(req, VERSION);

export type ControlOp = "pause" | "resume" | "stop" | "take" | "giveback";

const LABEL: Record<ControlOp, string> = { pause: "pause", resume: "resume", stop: "stop", take: "take", giveback: "give back" };

const failed = (err: string): Result => ({ code: 1, err });

/** The engine's text, or its refusal under the command the user typed. */
function text(r: Reply, label: string): Result {
  return r.ok ? { code: 0, out: String(r.text ?? "") } : failed(`wf ${label}: ${r.error}`);
}

/** `wf status`: every open task with its progress and the runs in flight. */
export async function status(a: Ask = ask): Promise<Result> {
  return text(await a({ op: "status" }), "status");
}

/** `wf show <what>`: a task's step tree, a step with its runs, or one run and its artifacts. */
export async function show(what: string | undefined, a: Ask = ask): Promise<Result> {
  if (!what) throw new UsageError("usage: wf show <task|step|run>");
  return text(await a({ op: "show", what }), "show");
}

/** `wf pause|resume|stop|take|give back <what>`, each one server op. */
export async function control(op: ControlOp, what: string | undefined, a: Ask = ask): Promise<Result> {
  if (!what) throw new UsageError(`usage: wf ${LABEL[op]} <task|step|run>`);
  return text(await a({ op, what }), LABEL[op]);
}

/** `wf tell <what> "<text>"`: to a waiting plan, or typed into a running task's terminals. */
export async function tell(what: string | undefined, words: string, a: Ask = ask): Promise<Result> {
  const message = words.trim();
  if (!what || !message) throw new UsageError('usage: wf tell <task> "<text>"');
  const r = await a({ op: "tell", task: what, text: message });
  if (!r.ok) return failed(`wf tell: ${r.error}`);
  // A running task was told (success); a plan that ran again hands back its new status.
  return { code: EXIT[String(r.status)] ?? 0, out: `${r.task} ${r.status}\n\n${r.text}` };
}

/** `hc attach`: the terminal's output goes straight to the user's screen. */
export const attach = async (address: string): Promise<number> =>
  (await Bun.spawn(["hc", "attach", address], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })).exited;

export type WatchOptions = { brain?: string; state?: string; attach?: (address: string) => Promise<number> };

/** The run to watch: the one named, else the step's last run, else the task's latest active one. */
function runToWatch(picked: Picked): Run | null {
  if (picked.run) return picked.run;
  const runs = picked.step ? picked.step.runs : flat(picked.task.steps).flatMap((s) => s.runs);
  return [...runs].reverse().find((r) => r.ended === null) ?? runs[runs.length - 1] ?? null;
}

/** `wf watch <what>`: attach to an active run, or print the screen an ended run saved. */
export async function watch(spec: Spec, what: string | undefined, o: WatchOptions = {}): Promise<Result> {
  if (!what) throw new UsageError("usage: wf watch <task|step|run>");
  const picked = select(new Store(o.brain ?? brainRoot(), spec).open(), what);
  if ("error" in picked) return failed(`wf watch: ${picked.error}`);
  const run = runToWatch(picked);
  if (!run) return failed(`wf watch: ${picked.step?.id ?? picked.task.id} has no run yet`);
  if (run.ended !== null) {
    const file = join(o.state ?? stateDir(), "runs", run.id, "screen.txt");
    if (!existsSync(file)) return failed(`wf watch: ${run.id} ended (${run.outcome}) and its screen was not saved`);
    return { code: 0, out: readFileSync(file, "utf8").trimEnd() };
  }
  if (!run.terminal) return failed(`wf watch: ${run.id} has no terminal yet`);
  return { code: await (o.attach ?? attach)(run.terminal) };
}

/** `wf merge` / `wf merge in <folder>`; anything else is a usage error. */
function mergeFolder(rest: string[]): string {
  if (!rest.length) return process.cwd();
  if (rest.length !== 2 || rest[0] !== "in" || !rest[1]) throw new UsageError("usage: wf merge [in <folder>]");
  const raw = rest[1] === "~" ? homedir() : rest[1].startsWith("~/") ? join(homedir(), rest[1].slice(2)) : rest[1];
  return isAbsolute(raw) ? raw : resolve(raw);
}

/** `wf merge`: the integration branch into the user's current branch; the one command that moves it. */
export async function merge(spec: Spec, rest: string[], x: Exec = exec): Promise<Result> {
  const folder = mergeFolder(rest);
  const branch = spec.policy.integration_branch;
  try {
    const root = await repoRoot(folder, x);
    const merged = await mergeUserBranch(root, branch, x);
    if ("conflicts" in merged) {
      return {
        code: 1,
        err: [
          `wf merge: ${branch} conflicts with your branch; the merge was aborted.`,
          `Resolve it yourself: git merge ${branch}`,
          ...(merged.conflicts.length ? ["Conflicting files:", ...merged.conflicts.map((f) => `  ${f}`)] : []),
        ].join("\n"),
      };
    }
    return { code: 0, out: `merged ${branch} (${merged.commit})` };
  } catch (e) {
    return failed(`wf merge: ${(e as Error).message}`);
  }
}
