// wf: the workflow engine's command line.
import { join } from "node:path";
import { loadSpec, type Spec } from "./spec";
import { readDoc, SpecError } from "./frontmatter";
import { checkTask } from "./records";
import { adaptersDir, loadRunners, type RunnerCode } from "./runners";
import { parseCommand, UsageError } from "./args";
import { call, request, NotRunning } from "./client";
import { available } from "./plans";
import { VERSION, brainRoot, engineName, socketPath, stateDir } from "./paths";
import { openBoard } from "../adapters/host/herdr/host";
import * as control from "./control-cli";
import { EXIT } from "./control-cli";

export const specDir = (): string => process.env.WF_SPEC || join(import.meta.dir, "..", "spec");

function help(spec: Spec): string {
  const live = [...spec.commands.values()].filter((c) => available(spec, c));
  const width = Math.max(...live.map((c) => c.example.length));
  return `wf — multi-agent workflow engine

${live.map((c) => `  wf ${c.example.padEnd(width)}  ${c.about}`).join("\n")}

  options: ${live.flatMap((c) => c.options).filter((o, i, a) => a.indexOf(o) === i).join(", ")}

  wf approve <task>                    start the work of a plan that waits for you
  wf report <run> <outcome> ["text"]   for workers: hand back a run's outcome (text or stdin)
  wf status [--json]                   every open task, its progress and the runs in flight (JSON with --json)
  wf show <task|step|run>              details of one task, step or run
  wf watch <task|step|run>             attach to a run's terminal, or print its last screen
  wf pause|resume|stop <task>          pause, resume or stop a task
  wf tell <task> "<change>"            send words to a waiting plan or a running task
  wf take <step|run>                   drive a run yourself (the engine stops checking it)
  wf give back <step|run>              give a taken run back to the engine
  wf merge [in <folder>]               merge wf/integration into your current branch
  wf board                             open the wf board in Herdr (the engine's space)
  wf serve                             the engine itself (started on demand as hc terminal 'wf')
  wf hook <runner>                     a runner's tool hook (registered by the Nix module)
  wf lint [<record.md>…]               check the spec, adapters and task records`;
}

async function lint(spec: Spec, files: string[]): Promise<number> {
  const runners = await loadRunners(spec);
  const errors = files.flatMap((f) => {
    try {
      return checkTask(f, readDoc(f).data, spec);
    } catch (e) {
      return [e instanceof SpecError ? e.message : `${f}: ${(e as Error).message}`];
    }
  });
  if (errors.length) return console.error(errors.join("\n")), 1;
  console.log(files.length ? `ok: ${files.length} record(s) valid` : `ok: spec valid (${spec.roles.size} roles, ${spec.commands.size} commands, ${runners.size} runners)`);
  return 0;
}

async function serveCmd(spec: Spec): Promise<number> {
  const { serve } = await import("./server");
  const { Store } = await import("./store");
  const { herdrHost } = await import("../adapters/host/herdr/host");
  const { brainKnowledge } = await import("../adapters/knowledge/brain/knowledge");
  const log = (line: string) => console.log(`${new Date().toTimeString().slice(0, 8)}  ${line}`);
  const root = brainRoot();
  const deps = { spec, runners: await loadRunners(spec), host: herdrHost, store: new Store(root, spec), knowledge: brainKnowledge(root), state: stateDir(), now: () => new Date(), log };
  const running = await serve(deps, socketPath());
  const quit = () => void running.stop().then(() => process.exit(0));
  process.on("SIGTERM", quit);
  process.on("SIGINT", quit);
  await running.done;
  return 0;
}

/** `--escaped`: the text came on one line with \n, \t and \\ escapes (for single-line shells). */
export const unescape = (t: string): string => t.replace(/\\(n|t|\\)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : "\\"));

/** stdin, unless nothing arrives in time: a shell that drops a heredoc must not hang the worker. */
async function stdinText(ms = 10_000): Promise<string> {
  if (process.stdin.isTTY) return "";
  return Promise.race([Bun.stdin.text(), Bun.sleep(ms).then(() => "")]);
}

async function reportCmd(rest: string[]): Promise<number> {
  const escaped = rest.includes("--escaped");
  const [run, outcome, ...words] = rest.filter((w) => w !== "--escaped");
  if (!run || !outcome) throw new UsageError('usage: wf report <run> <outcome> [--escaped] ["text"]  (or text on stdin)');
  const raw = words.length ? words.join(" ") : await stdinText();
  if (!raw.trim()) throw new UsageError(`no report text: pass it as one quoted argument, e.g. wf report ${run} ${outcome} "…"`);
  const text = escaped ? unescape(raw) : raw;
  // Never start an engine for a report: a worker belongs to the engine that started it.
  const r = await request({ op: "report", run, outcome, text }).catch((e: Error) => {
    if (e instanceof NotRunning) throw new Error(`the engine that started ${run} is not reachable at ${socketPath()}`);
    throw e;
  });
  if (!r.ok) return console.error(`wf report: ${r.error}`), 1;
  console.log(`ok: ${run} ${outcome} handed back`);
  return 0;
}

/**
 * `wf hook <runner>`: a CLI's tool hook. Loads only that runner's code (no spec), and fails closed
 * inside a wf run: any error denies, since a silent hook would let the call through.
 */
async function hookCmd(name: string | undefined): Promise<number> {
  try {
    const code = (await import(join(adaptersDir(), "runners", name ?? "", "runner.ts"))) as RunnerCode;
    if (!code.hook) throw new Error(`runner '${name}' has no hook`);
    process.stdout.write(code.hook(await Bun.stdin.text(), process.env));
    return 0;
  } catch (e) {
    if (process.env.WF_GUARD) process.stdout.write(JSON.stringify({ decision: "deny", reason: `wf guard failed: ${(e as Error).message}` }));
    console.error(`wf hook: ${(e as Error).message}`);
    return process.env.WF_GUARD ? 0 : 2;
  }
}

/** `wf approve <task>`: start a plan that waits for you; waits for what comes next. */
async function approveCmd(rest: string[]): Promise<number> {
  const [task] = rest;
  if (!task) throw new UsageError("usage: wf approve <task>");
  const r = await call({ op: "approve", task }, VERSION);
  if (!r.ok) return console.error(`wf approve: ${r.error}`), 1;
  console.log(`${r.task} ${r.status}\n\n${r.text}`);
  return EXIT[String(r.status)] ?? 1;
}

/** Print a control command's result; its code is the CLI's exit code. */
function emit(r: control.Result): number {
  if (r.out) console.log(r.out);
  if (r.err) console.error(r.err);
  return r.code;
}

async function submitCmd(spec: Spec, argv: string[]): Promise<number> {
  if (!available(spec, spec.commands.get(argv[0])!)) throw new UsageError(`'${argv[0]}' is not available yet`);
  const submit = parseCommand(spec, argv, process.cwd(), process.env);
  const to = submit.options["report-to"];
  const r = await call({ op: "submit", submit, wait: !to }, VERSION);
  if (!r.ok) return console.error(`wf ${argv[0]}: ${r.error}`), 1;
  if (to) return console.log(`${r.task} started; the result goes to ${to}`), 0;
  console.log(`${r.task} ${r.status}\n\n${r.text}`);
  return EXIT[String(r.status)] ?? 1;
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === "hook") return hookCmd(rest[0]);
  try {
    const spec = loadSpec(specDir());
    if (cmd === "lint") return await lint(spec, rest);
    if (cmd === "serve") return await serveCmd(spec);
    if (cmd === "report") return await reportCmd(rest);
    if (cmd === "approve") return await approveCmd(rest);
    if (cmd === "status") return emit(await control.status(rest.includes("--json")));
    if (cmd === "show") return emit(await control.show(rest[0]));
    if (cmd === "watch") return emit(await control.watch(spec, rest[0]));
    if (cmd === "tell") return emit(await control.tell(rest[0], rest.slice(1).join(" ")));
    if (cmd === "pause" || cmd === "resume" || cmd === "stop" || cmd === "take") return emit(await control.control(cmd, rest[0]));
    if (cmd === "give") {
      if (rest[0] !== "back") throw new UsageError("usage: wf give back <task|step|run>");
      return emit(await control.control("giveback", rest[1]));
    }
    if (cmd === "merge") return emit(await control.merge(spec, rest));
    if (cmd === "board") return console.log(await openBoard(engineName())), 0;
    if (cmd && spec.commands.has(cmd)) return await submitCmd(spec, argv);
    if (cmd === undefined || ["help", "--help", "-h"].includes(cmd)) return console.log(help(spec)), cmd === undefined ? 2 : 0;
    console.error(`wf: unknown command '${cmd}'\n\n${help(spec)}`);
    return 2;
  } catch (e) {
    if (e instanceof UsageError) return console.error(`wf: ${e.message}`), 2;
    if (e instanceof SpecError) return console.error(`wf: the spec is invalid:\n${e.message}`), 1;
    console.error(`wf: ${(e as Error).message}`);
    return 1;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
