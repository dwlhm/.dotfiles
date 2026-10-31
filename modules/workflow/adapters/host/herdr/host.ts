// Host adapter for herdr-core: every run is an hc terminal, a child of the `wf serve` terminal.
import type { Host, Terminal } from "../../../engine/host";
import { withEnv } from "../../../engine/paths";

const NOT_FOUND = 3;

async function call(args: string[]): Promise<{ out: string; err: string; code: number }> {
  const p = Bun.spawn(["hc", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { out, err, code };
}

async function hc(args: string[], allowFail = false): Promise<string> {
  const r = await call(args);
  if (r.code !== 0 && !allowFail) throw new Error(`hc ${args[0]} failed (${r.code}): ${r.err.trim() || r.out.trim()}`);
  return r.out;
}

/** The engine's own space and tab: Herdr makes them for ids it does not know yet. */
export const engineLabels = (name: string): Record<string, string> => ({ "herdr.space": name, "herdr.tab": name });

export const herdrHost: Host = {
  // hc terminals do not inherit the caller's environment and `hc run` has no env flag.
  async spawn({ name, cwd, argv, env, labels }) {
    const label = Object.entries(labels).flatMap(([k, v]) => ["--label", `${k}=${v}`]);
    // --no-notify: the engine asks for status itself; notes typed into its terminal would be noise.
    const out = await hc(["run", "--bg", "--json", "--no-notify", "--name", name, "--cwd", cwd, ...label, "--", ...withEnv(argv, env)]);
    const address = JSON.parse(out).address;
    if (typeof address !== "string") throw new Error(`hc run returned no address: ${out}`);
    return address;
  },

  async get(address) {
    const r = await call(["get", address, "--json"]);
    if (r.code === NOT_FOUND) return { state: "gone", status: null, exit: null };
    if (r.code !== 0) throw new Error(`hc get ${address} failed (${r.code}): ${r.err.trim() || r.out.trim()}`);
    const t = JSON.parse(r.out);
    const status = t.status && typeof t.status === "object" ? { state: String(t.status.state), kind: t.status.kind } : null;
    return { state: t.state === "live" ? "live" : "finished", status, exit: t.exit_code ?? null } satisfies Terminal;
  },

  async waitChildren(seconds) {
    await hc(["wait", "--children", "any", "--timeout", String(seconds), "--json"], true);
  },

  async snapshot(address, lines) {
    return hc(["read", address, "--lines", String(lines)], true);
  },

  async close(address) {
    await hc(["kill", address], true);
    await hc(["rm", address], true);
  },

  async send(address, text) {
    await hc(["send", address, text]);
  },
};
