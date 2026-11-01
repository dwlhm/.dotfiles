// A fake herdr-core for the tests: terminals live in a set, every hc call and detached process is
// recorded. No real process starts but git, which runs for real on the tests' temporary repos.
import { realSys, type Sys } from "./sys";

export const U = (i: number) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`;

export function fakeSys(state: string) {
  const live = new Set<string>();
  const calls: string[][] = [];
  const detached: { argv: string[]; env: Record<string, string | undefined> }[] = [];
  let n = 0, clock = 1000, ids = 0;
  const sys: Sys & { live: Set<string>; calls: string[][]; detached: typeof detached; as(t: string | undefined): void } = {
    live, calls, detached,
    detach(argv, env) { detached.push({ argv, env }); },
    env: { BOARD_STATE: state },
    cwd: () => "/repo",
    now: () => clock++,
    uuid: () => U(++ids),
    which: (c) => `/bin/${c}`,
    isDir: (p) => !p.startsWith("/missing"),
    as(t) { this.env = { ...this.env, HC_TERMINAL_ID: t }; },
    async run(argv) {
      if (argv[0] === "git") return realSys.run(argv);
      calls.push(argv);
      const [, cmd, arg] = argv;
      if (cmd === "run") { const a = `t${++n}`; live.add(a); return { code: 0, out: JSON.stringify({ address: a }), err: "" }; }
      if (cmd === "get") return live.has(arg) ? { code: 0, out: JSON.stringify({ state: "live" }), err: "" } : { code: 1, out: "", err: "no terminal" };
      if (cmd === "kill") live.delete(arg);
      return { code: 0, out: "", err: "" };
    },
  };
  return sys;
}
