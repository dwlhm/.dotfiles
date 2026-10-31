// Reconcile active runs with what the host observes. Status is only what hc reports (OSC 7501);
// a run "started" once it was seen working, so earlier statuses are startup noise.
import type { Engine } from "./engine";
import type { Active } from "./types";

/** How long a worker may sit idle after the reminder before the run counts as `infra`. */
export const NUDGE_SECONDS = 90;

export const NUDGE =
  "You stopped without handing back the outcome. Run the `wf report` command from your instructions now (done, stuck or question), then stop.";

async function check(e: Engine, a: Active, now: number): Promise<void> {
  const { limits } = e.d.spec.policy;
  if (!a.run.terminal) return; // still spawning
  const t = await e.d.host.get(a.run.terminal);
  const age = (now - Date.parse(a.run.started)) / 1000;
  if (t.state !== "live") return e.finish(a, "infra", `the agent exited (code ${t.exit ?? "?"}) without reporting`);
  const runner = e.d.runners.get(a.run.runner);
  const s = t.status;
  if (s?.state === "working" && !runner?.code.noise?.(s)) {
    a.working = true;
    a.nudged = 0;
  }
  if (!a.working) {
    const start = Math.min(limits.start_seconds, runner?.startSeconds ?? Infinity);
    if (age > start) await e.finish(a, "infra", `did not start working within ${start}s`);
    return;
  }
  if (age > limits.run_minutes * 60) return e.finish(a, "infra", `still working after ${limits.run_minutes} minutes`);
  if (s?.state === "blocked" && a.task.status === "running") {
    a.task.status = "blocked";
    e.d.store.save(a.task);
    e.d.log(`${a.run.id} waits for a person (${s.kind ?? "blocked"}) on ${a.run.terminal}`);
  }
  if (s?.state === "working" && a.task.status === "blocked") {
    a.task.status = "running";
    e.d.store.save(a.task);
  }
  if (s?.state !== "idle" && s?.state !== "done") return;
  if (!a.nudged) {
    a.nudged = now;
    await e.d.host.send(a.run.terminal, NUDGE).catch(() => {});
  } else if ((now - a.nudged) / 1000 > NUDGE_SECONDS) {
    await e.finish(a, "infra", "stopped without reporting, even after a reminder");
  }
}

/** One pass over every active run. */
export async function reconcile(e: Engine): Promise<void> {
  const now = e.d.now().getTime();
  for (const a of [...e.active.values()]) {
    try {
      await check(e, a, now);
    } catch (err) {
      e.d.log(`${a.run.id} could not be checked: ${(err as Error).message}`);
    }
  }
}

/** Runs until `stop()` returns true: wait for child news, reconcile, back off when nothing moves. */
export async function watch(e: Engine, stop: () => boolean, sleep = (ms: number) => Bun.sleep(ms)): Promise<void> {
  while (!stop()) {
    if (!e.active.size) {
      await sleep(1000);
      continue;
    }
    const t0 = Date.now();
    await e.d.host.waitChildren(30);
    await reconcile(e);
    if (Date.now() - t0 < 1000) await sleep(2000);
  }
}
