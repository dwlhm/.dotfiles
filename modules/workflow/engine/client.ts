// Talking to `wf serve`, and starting it as the hc terminal `wf` when it is not running.
import { engineLabels } from "../adapters/host/herdr/host";
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

export type HcResult = { code: number; out: string; err: string };

/** `hc` itself, injectable so the start path is testable without real terminals. */
export type Hc = (args: string[]) => Promise<HcResult>;

const runHc: Hc = async (args) => {
  const p = Bun.spawn(["hc", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, out, err: err.trim() };
};

const live = async (name: string, hc: Hc) => {
  const r = await hc(["get", name, "--json"]);
  return r.code === 0 && JSON.parse(r.out).state === "live";
};

/** Start `wf serve` in its own hc terminal (no parent: it must outlive whoever started it). */
export async function start(hc: Hc = runHc): Promise<void> {
  const name = engineName();
  if (await live(name, hc)) return; // starting up, or started by a client racing this one
  await hc(["rm", name]);
  const label = Object.entries(engineLabels(name)).flatMap(([k, v]) => ["--label", `${k}=${v}`]);
  const r = await hc(["run", "--bg", "--json", "--no-parent", "--no-notify", "--name", name, ...label, "--", ...withEnv(["wf", "serve"], wfEnv())]);
  // Losing the race to another client is fine: its engine is the one to wait for.
  if (r.code !== 0 && !(await live(name, hc))) throw new Error(`could not start wf serve: ${r.err || r.out.trim()}`);
}

/**
 * An engine running older wf code (from before a `nix sync`) is replaced when idle; a busy one is
 * kept, and this call is served by it, with a warning.
 */
async function current(version: string, hc: Hc): Promise<boolean> {
  const ping = await request({ op: "ping" });
  if (ping.version === version) return true;
  if (Number(ping.active)) {
    console.error(`wf: the running engine is an older wf with ${ping.active} active run(s); it is replaced once idle`);
    return true;
  }
  // An engine older than the quit request answers it with an error; idle, it is safe to end.
  if (!(await request({ op: "quit" })).ok) await hc(["kill", engineName()]);
  for (let i = 0; i < 25; i++) {
    await Bun.sleep(100);
    if (!(await live(engineName(), hc))) return false;
  }
  throw new Error(`the old engine did not quit; see \`hc read ${engineName()}\``);
}

/** Send `req`, starting (or replacing an outdated) engine first when needed. */
export async function call(req: object, version: string, hc: Hc = runHc): Promise<Reply> {
  try {
    if (await current(version, hc)) return await request(req);
    await start(hc);
  } catch (e) {
    if (!(e instanceof NotRunning)) throw e;
    await start(hc);
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
