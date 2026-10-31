// Test doubles: a scripted host, a scratch brain repo and an engine wired to them.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Host, Terminal } from "./host";
import { Engine } from "./engine";
import { Store } from "./store";
import { loadSpec } from "./spec";
import { specDir } from "./cli";
import type { Runner, RunnerCode } from "./runners";
import { noKnowledge, type Knowledge } from "./knowledge";

export class FakeHost implements Host {
  spawned: { name: string; cwd: string; argv: string[]; env: Record<string, string>; labels: Record<string, string>; address: string }[] = [];
  terminals = new Map<string, Terminal>();
  sent: { address: string; text: string }[] = [];
  closed: string[] = [];
  failSpawn = false;
  private n = 0;

  async spawn(o: { name: string; cwd: string; argv: string[]; env: Record<string, string>; labels: Record<string, string> }) {
    if (this.failSpawn) throw new Error("hc is not running");
    const address = `t${++this.n}`;
    this.spawned.push({ ...o, address });
    this.terminals.set(address, { state: "live", status: null, exit: null });
    return address;
  }
  set(address: string, t: Partial<Terminal>) {
    this.terminals.set(address, { ...this.terminals.get(address)!, ...t });
  }
  async get(address: string) {
    return this.terminals.get(address) ?? { state: "gone" as const, status: null, exit: null };
  }
  async waitChildren() {}
  async snapshot(address: string) {
    return `screen of ${address}`;
  }
  async close(address: string) {
    this.closed.push(address);
    this.terminals.delete(address);
  }
  async send(address: string, text: string) {
    this.sent.push({ address, text });
  }
}

export const fakeRunner = (name: string, models: string[], over: Partial<Runner> = {}): Runner => ({
  name,
  enforces: ["read", "edit", "shell-report", "shell-check", "shell-git-read", "shell-qa", "network"],
  trust: false,
  models: models.map((id) => ({ id, tier: "small", cost: 0 })),
  code: { launch: (i) => ({ argv: [name, "--model", i.model, i.prompt], env: { RUNNER_ONLY: "1" } }) } satisfies RunnerCode,
  ...over,
});

export async function scratchBrain(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "wf-brain-"));
  mkdirSync(join(root, "projects"));
  writeFileSync(join(root, "projects", "README.md"), "| Project path | File |\n|---|---|\n");
  for (const args of [["init", "-q"], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["commit", "-q", "--allow-empty", "-m", "init"]]) {
    await Bun.spawn(["git", "-C", root, ...args]).exited;
  }
  return root;
}

export async function makeEngine(o: { runners?: Runner[]; knowledge?: Knowledge; clock?: { t: number } } = {}) {
  const spec = loadSpec(specDir());
  const brain = await scratchBrain();
  const host = new FakeHost();
  const clock = o.clock ?? { t: Date.parse("2026-10-31T17:00:00Z") };
  const logs: string[] = [];
  const runners = new Map((o.runners ?? [fakeRunner("oc", ["m1"])]).map((r) => [r.name, r]));
  const store = new Store(brain, spec);
  const state = mkdtempSync(join(tmpdir(), "wf-state-"));
  const engine = new Engine({ spec, runners, host, store, knowledge: o.knowledge ?? noKnowledge, state, now: () => new Date(clock.t), log: (l) => logs.push(l) });
  return { engine, host, brain, store, state, clock, logs, spec };
}

/** Let fire-and-forget promises (spawn, commit) settle. */
export const settle = async () => {
  for (let i = 0; i < 20; i++) await Bun.sleep(1);
};
