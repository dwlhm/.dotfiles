// Where wf reads and writes outside its own package. Overridable for tests and isolated runs.
import { homedir } from "node:os";
import { join } from "node:path";

export const brainRoot = (): string => process.env.WF_BRAIN || join(homedir(), "brain");
export const stateDir = (): string => process.env.WF_STATE || join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "wf");
export const socketPath = (): string => join(stateDir(), "wf.sock");

/** The engine's hc terminal: `wf` for the default state, unique per other state folder. */
export const engineName = (): string =>
  process.env.WF_STATE ? `wf-${new Bun.CryptoHasher("sha1").update(stateDir()).digest("hex").slice(0, 8)}` : "wf";

/** The variables that locate this engine; whatever it starts must get them explicitly. */
export const ENV_KEYS = ["WF_BRAIN", "WF_STATE", "WF_SPEC", "WF_ADAPTERS", "XDG_STATE_HOME"];

/** This engine's location, for programs it starts (a worker's `wf report` must reach it). */
export const wfEnv = (): Record<string, string> =>
  Object.fromEntries(ENV_KEYS.filter((k) => process.env[k]).map((k) => [k, process.env[k]!]));

/** For launchers that do not pass an environment (hc): prefix argv with env(1). */
export const withEnv = (argv: string[], env: Record<string, string>): string[] => {
  const pairs = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  return pairs.length ? ["env", ...pairs, ...argv] : argv;
};
