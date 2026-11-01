// Everything the board touches outside its store: programs, environment, time, ids. Injected so
// tests never start a real hc terminal or agent.
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Result { code: number; out: string; err: string }

export interface Sys {
  run(argv: string[]): Promise<Result>;
  env: Record<string, string | undefined>;
  cwd(): string;
  now(): number;
  uuid(): string;
  which(cmd: string): string | null;
  isDir(path: string): boolean;
}

export const realSys: Sys = {
  async run(argv) {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return { code, out, err };
  },
  env: process.env,
  cwd: () => process.cwd(),
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
  which: (cmd) => Bun.which(cmd),
  isDir: (path) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false,
};

export const stateDir = (env: Sys["env"]) =>
  env.BOARD_STATE ?? join(env.HOME ?? homedir(), ".local", "state", "board");
