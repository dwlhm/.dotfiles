// Talking to `wf serve`, and starting it as the hc terminal `wf` when it is not running.
import { engineName, socketPath, wfEnv, withEnv } from "./paths";

export type Reply = { ok: boolean; error?: string; [k: string]: unknown };

/** Nothing listens: safe to start the engine and send again (the request never left). */
export class NotRunning extends Error {}

/** One request, one reply. Rejects with NotRunning only when the connection never opened. */
export function request(req: object, path = socketPath()): Promise<Reply> {
  return new Promise((resolve, reject) => {
    let buf = "";
    let opened = false;
    Bun.connect({
      unix: path,
      socket: {
        open(s) {
          opened = true;
          s.write(JSON.stringify(req) + "\n");
        },
        data(_s, chunk) {
          buf += chunk.toString();
        },
        close() {
          if (!buf.trim()) return reject(new Error("wf closed the connection without a reply"));
          try {
            resolve(JSON.parse(buf));
          } catch {
            reject(new Error(`malformed reply: ${buf.slice(0, 200)}`));
          }
        },
        error: (_s, err) => reject(opened ? err : new NotRunning(err.message)),
      },
    }).catch((err: Error) => reject(opened ? err : new NotRunning(err.message)));
  });
}

async function hc(args: string[]): Promise<{ code: number; out: string; err: string }> {
  const p = Bun.spawn(["hc", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, out, err: err.trim() };
}

const live = async (name: string) => {
  const r = await hc(["get", name, "--json"]);
  return r.code === 0 && JSON.parse(r.out).state === "live";
};

/** Start `wf serve` in its own hc terminal (no parent: it must outlive whoever started it). */
async function start(): Promise<void> {
  const name = engineName();
  if (await live(name)) return; // starting up, or started by a client racing this one
  await hc(["rm", name]);
  const r = await hc(["run", "--bg", "--json", "--no-parent", "--no-notify", "--name", name, "--", ...withEnv(["wf", "serve"], wfEnv())]);
  // Losing the race to another client is fine: its engine is the one to wait for.
  if (r.code !== 0 && !(await live(name))) throw new Error(`could not start wf serve: ${r.err || r.out.trim()}`);
}

/** Send `req`, starting the engine first when nothing answers. */
export async function call(req: object): Promise<Reply> {
  try {
    return await request(req);
  } catch (e) {
    if (!(e instanceof NotRunning)) throw e;
    await start();
  }
  for (let i = 0; i < 75; i++) {
    await Bun.sleep(200);
    try {
      return await request(req);
    } catch (e) {
      if (!(e instanceof NotRunning)) throw e;
    }
  }
  throw new Error(`wf serve is not answering after 15s; see \`hc read ${engineName()}\``);
}
