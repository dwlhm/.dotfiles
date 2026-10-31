// `wf serve`: the long-lived engine, run as an hc terminal. One JSON request line per connection
// on a unix socket; one JSON reply line. Workers are its children, so they end with it.
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import type { Socket } from "bun";
import { Engine } from "./engine";
import type { Deps } from "./types";
import { approve } from "./build";
import { giveBack, pause, resume, show, status, stop as stopTask, take, tell as tellTask } from "./control";
import { watch } from "./watch";
import { request } from "./client";
import { VERSION } from "./paths";

export type Request =
  | { op: "ping" }
  | { op: "quit" }
  | { op: "submit"; submit: import("./engine").Submit; wait: boolean }
  | { op: "report"; run: string; outcome: string; text: string }
  | { op: "approve"; task: string }
  | { op: "tell"; task: string; text: string }
  | { op: "status" }
  | { op: "show"; what: string }
  | { op: "pause" | "resume" | "stop" | "take" | "giveback"; what: string };

async function handle(e: Engine, req: Request): Promise<Record<string, unknown>> {
  if (req.op === "ping") return { ok: true, active: e.active.size, version: VERSION };
  if (req.op === "quit") {
    if (e.active.size) return { ok: false, error: `${e.active.size} run(s) still active` };
    return { ok: true }; // the engine stops once this reply is out
  }
  if (req.op === "report") {
    await e.report(req.run, req.outcome, req.text);
    return { ok: true };
  }
  if (req.op === "approve") {
    const task = e.tasks.get(req.task);
    if (!task) throw new Error(`no open task ${req.task}`);
    approve(e, task);
    const r = await e.wait(task);
    return { ok: true, task: r.task.id, status: r.task.status, text: r.text };
  }
  if (req.op === "tell") {
    const told = await tellTask(e, req.task, req.text);
    // A plan being changed runs again: wait for what it produces. A running task is told and left.
    if (!told.wait) return { ok: true, task: told.task.id, status: told.task.status, text: told.text };
    const r = await e.wait(told.task);
    return { ok: true, task: r.task.id, status: r.task.status, text: r.text };
  }
  if (req.op === "status") return { ok: true, text: status(e) };
  if (req.op === "show") return { ok: true, text: show(e, req.what) };
  if (req.op === "pause" || req.op === "resume" || req.op === "stop" || req.op === "take" || req.op === "giveback") {
    const op = { pause, resume, stop: stopTask, take, giveback: giveBack }[req.op];
    return { ok: true, text: await op(e, req.what) };
  }
  if (req.op === "submit") {
    const task = await e.submit(req.submit);
    if (!req.wait) return { ok: true, task: task.id };
    const r = await e.wait(task);
    return { ok: true, task: r.task.id, status: r.task.status, text: r.text };
  }
  throw new Error(`unknown request '${(req as { op: string }).op}'`);
}

function reply(sock: Socket<{ buf: string }>, body: Record<string, unknown>): void {
  sock.write(JSON.stringify(body) + "\n");
  sock.end();
}

/** Refuses to start twice; removes a stale socket left by a crashed engine. */
async function claim(path: string): Promise<void> {
  // macOS sockaddr_un.sun_path holds 104 bytes including the terminating NUL.
  if (Buffer.byteLength(path) > 103) throw new Error(`socket path is ${Buffer.byteLength(path)} bytes, over the 103-byte limit: ${path} (set WF_STATE shorter)`);
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) return;
  const alive = await request({ op: "ping" }, path).then(() => true, () => false);
  if (alive) throw new Error(`wf is already running (${path})`);
  unlinkSync(path);
}

export type Running = { stop(): Promise<void>; done: Promise<void> };

/** One JSON line in, one JSON line out; `onQuit` runs once an accepted quit's reply is out. */
function listen(e: Engine, path: string, onQuit: () => void) {
  return Bun.listen<{ buf: string }>({
    unix: path,
    socket: {
      open: (s) => void (s.data = { buf: "" }),
      data(s, chunk) {
        s.data.buf += chunk.toString();
        const nl = s.data.buf.indexOf("\n");
        if (nl < 0) return;
        let req: Request;
        try {
          req = JSON.parse(s.data.buf.slice(0, nl));
        } catch {
          return reply(s, { ok: false, error: "malformed request" });
        }
        handle(e, req).then(
          (r) => {
            reply(s, r);
            if (req.op === "quit" && r.ok) onQuit();
          },
          (err) => reply(s, { ok: false, error: (err as Error).message }),
        );
      },
    },
  });
}

export async function serve(d: Deps, path: string): Promise<Running> {
  await claim(path);
  const e = new Engine(d);
  await e.recover();
  let stopping = false;
  const server = listen(e, path, () => {
    d.log("quitting: a newer wf asked to take over");
    void running.stop();
  });
  d.log(`ready on ${path}`);
  const running: Running = {
    done: watch(e, () => stopping),
    // Records are already on disk; pending brain commits get a moment, never a hang.
    async stop() {
      stopping = true;
      server.stop(); // let replies already being written finish
      if (existsSync(path)) unlinkSync(path);
      await Promise.race([d.store.flushed(), Bun.sleep(2000)]);
    },
  };
  return running;
}
