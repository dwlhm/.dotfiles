// The host contract: where runs live as terminals. The Herdr/hc adapter implements it; tests use a
// fake. The engine never reads a terminal's state into a record: it asks the host when it needs it.
import type { Status } from "./runners";

export type Terminal = { state: "live" | "finished" | "gone"; status: Status | null; exit: number | null };

export interface Host {
  /** Start `argv` with `env` in `cwd` as a child of the engine; returns the terminal address. */
  spawn(o: { name: string; cwd: string; argv: string[]; env: Record<string, string>; labels: Record<string, string> }): Promise<string>;
  get(address: string): Promise<Terminal>;
  /** Resolve when a child's status or state may have changed, or after `seconds`. */
  waitChildren(seconds: number): Promise<void>;
  /** The terminal's screen plus some history, as text. */
  snapshot(address: string, lines: number): Promise<string>;
  /** End and forget the terminal. */
  close(address: string): Promise<void>;
  /** Type `text` into another terminal (a `report-to` target). */
  send(address: string, text: string): Promise<void>;
}

/** hc names: 1-32 of a-z 0-9 - _. Run ids carry dots, so they are spelled with dashes. */
export const terminalName = (runId: string): string => `wf-${runId.replace(/\./g, "-")}`.slice(0, 32);
