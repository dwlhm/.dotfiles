// Agent terminals on herdr-core. Each task's agent runs in its own hc terminal, labelled with its
// task and shown by Herdr as a tab of the `board` space. No parent: a sub-task's agent must not
// die when its creator's agent is stopped.
import type { Task } from "./store";
import type { Sys } from "./sys";

export const SPACE = "board";
/** Seconds an agent may keep working after its final report before its terminal ends anyway. */
const TURN_GRACE = 600;
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

  /** Starts `argv` for the task in `cwd` (its folder, or its worktree) and returns the terminal address. A finished terminal left
   *  from an earlier run of the task is removed first, since names are unique. */
  async spawn(task: Task, argv: string[], cwd: string): Promise<string> {
    const name = terminalName(task.id);
    await this.sys.run(["hc", "rm", name]);
    const program = this.sys.which(argv[0]) ?? argv[0];
    const out = await this.hc([
      "run", "--bg", "--json", "--no-parent", "--no-notify", "--name", name, "--cwd", cwd,
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

  /** Ends the terminal once its agent's current turn ends: the agent asking is still inside the
   *  `board` call that finishes its work. Runs apart from the caller, without its terminal id, so
   *  hc does not take the wait as the agent waiting on itself. */
  killAfterTurn(address: string) {
    const hc = this.sys.which("hc") ?? "hc";
    const { HC_TERMINAL_ID: _, ...env } = this.sys.env;
    this.sys.detach(["sh", "-c", `"$0" wait "$1" --timeout ${TURN_GRACE}; "$0" kill "$1"; "$0" rm "$1"`, hc, address], env);
  }
}
