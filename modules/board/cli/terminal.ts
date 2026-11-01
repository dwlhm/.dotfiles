// Agent terminals on herdr-core. Each task's agent runs in its own hc terminal, labelled with its
// task and shown by Herdr as a tab of the `board` space. No parent: a sub-task's agent must not
// die when its creator's agent is stopped.
import type { Task } from "./store";
import type { Sys } from "./sys";

export const SPACE = "board";
export const terminalName = (id: string) => `board-${id.toLowerCase().replaceAll(".", "-")}`;

export class Terminals {
  constructor(private sys: Sys) {}

  private async hc(args: string[]) {
    const r = await this.sys.run(["hc", ...args]);
    if (r.code !== 0) throw new Error(`hc ${args[0]} failed (${r.code}): ${(r.err || r.out).trim()}`);
    return r.out;
  }

  async alive(address: string | null): Promise<boolean> {
    if (!address) return false;
    const r = await this.sys.run(["hc", "get", address, "--json"]);
    if (r.code !== 0) return false;
    try {
      return JSON.parse(r.out).state === "live";
    } catch {
      return false;
    }
  }

  /** Starts `argv` for the task and returns the terminal address. A finished terminal left
   *  from an earlier run of the task is removed first, since names are unique. */
  async spawn(task: Task, argv: string[]): Promise<string> {
    const name = terminalName(task.id);
    await this.sys.run(["hc", "rm", name]);
    const program = this.sys.which(argv[0]) ?? argv[0];
    const out = await this.hc([
      "run", "--bg", "--json", "--no-parent", "--no-notify", "--name", name, "--cwd", task.cwd,
      "--label", `board.task=${task.id}`, "--label", `herdr.space=${SPACE}`, "--label", `herdr.tab=${name}`,
      "--", program, ...argv.slice(1),
    ]);
    const address = JSON.parse(out).address;
    if (typeof address !== "string") throw new Error(`hc run returned no address: ${out.trim()}`);
    return address;
  }

  send(address: string, text: string) {
    return this.hc(["send", address, text]);
  }

  async kill(address: string | null) {
    if (!address) return;
    await this.sys.run(["hc", "kill", address]);
    await this.sys.run(["hc", "rm", address]);
  }
}
