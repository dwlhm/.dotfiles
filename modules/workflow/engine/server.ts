// `wf serve`: the long-lived engine, run as an hc terminal. One JSON request line per connection
// on a unix socket; one JSON reply line. Workers are its children, so they end with it.
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import type { Socket } from "bun";
import { Engine, type Deps } from "./engine";
import { watch } from "./watch";
import { request } from "./client";

export type Request =
  | { op: "ping" }
  | { op: "submit"; submit: import("./engine").Submit; wait: boolean }
  | { op: "report"; run: string; outcome: string; text: string };

async function handle(e: Engine, req: Request): Promise<Record<string, unknown>> {
  if (req.op === "ping") return { ok: true, active: e.active.size };
  if (req.op === "report") {
    await e.report(req.run, req.outcome, req.text);
    return { ok: true };
  }
  if (req.op === "submit") {
    const task = e.submit(req.submit);
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

export async function serve(d: Deps, path: string): Promise<Running> {
  await claim(path);
  const e = new Engine(d);
  await e.recover();
  let stopping = false;
  const server = Bun.listen<{ buf: string }>({
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
        handle(e, req).then((r) => reply(s, r), (err) => reply(s, { ok: false, error: (err as Error).message }));
      },
    },
  });
  d.log(`ready on ${path}`);
  const done = watch(e, () => stopping);
  return {
    done,
    // Records are already on disk; pending brain commits get a moment, never a hang.
    async stop() {
      stopping = true;
      server.stop(true);
      if (existsSync(path)) unlinkSync(path);
      await Promise.race([d.store.flushed(), Bun.sleep(2000)]);
    },
  };
}
