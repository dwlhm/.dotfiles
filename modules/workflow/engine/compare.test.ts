import { test, expect } from "bun:test";
import { makeEngine, fakeRunner, settle } from "./testkit";
import { readDoc } from "./frontmatter";
import { checkTask } from "./records";
import { Store } from "./store";

// d is the only medium-tier agent: it does every summary, since `with` picks only the compared ones.
const d = fakeRunner("d", ["d1"], { models: [{ id: "dm", tier: "medium", cost: 0 }] });
const three = [fakeRunner("a", ["a1", "a2"]), fakeRunner("b", ["b1"]), fakeRunner("c", ["c1"]), d];
const compare = (opts: object = {}) => ({ command: "compare", goal: "best cache?", folder: "/tmp", options: { about: ["src/"], ...opts } });
const runOf = (k: Awaited<ReturnType<typeof makeEngine>>, step: string) => [...k.engine.active.values()].find((a) => a.step.id === step)!.run.id;

test("compare: one step per agent in parallel, then a summary over every answer", async () => {
  const k = await makeEngine({ runners: three });
  const task = await k.engine.submit(compare({ with: ["c", "a"] }));
  const waiting = k.engine.wait(task);
  await settle();
  expect(task.steps.map((s) => [s.id, s.role, s.with?.[0] ?? null, s.deps])).toEqual([
    ["w1.1", "research", "c", []],
    ["w1.2", "research", "a", []],
    ["w1.3", "summarize", null, ["w1.1", "w1.2"]],
  ]);
  expect(k.host.spawned.map((s) => s.argv[0])).toEqual(["c", "a"]); // both at once, each its own agent
  await k.engine.report(runOf(k, "w1.1"), "done", "C says LRU");
  expect(k.host.spawned.length).toBe(2); // the summary waits for every answer
  await k.engine.report(runOf(k, "w1.2"), "done", "A says LFU");
  await settle();
  expect(k.host.spawned[2].argv[0]).toBe("d");
  const prompt = k.host.spawned[2].argv.at(-1)!;
  expect(prompt).toContain("### c\nC says LRU\n\n### a\nA says LFU");
  await k.engine.report(runOf(k, "w1.3"), "done", "They disagree; LRU is backed by src/cache.ts:12.");
  const r = await waiting;
  expect(r.task.status).toBe("done");
  expect(r.text).toBe("## Summary\n\nThey disagree; LRU is backed by src/cache.ts:12.\n\n## c\n\nC says LRU\n\n## a\n\nA says LFU");
  const doc = readDoc(new Store(k.brain, k.spec).path(r.task));
  expect(checkTask("w1.md", doc.data, k.spec)).toEqual([]);
  expect(doc.body).toContain("## Report\n\n## Summary");
});

test("compare: an agent that cannot answer drops out; with one answer left there is no summary", async () => {
  const k = await makeEngine({ runners: three });
  const task = await k.engine.submit(compare({ with: ["a", "b"] }));
  const waiting = k.engine.wait(task);
  await settle();
  await k.engine.report(runOf(k, "w1.1"), "question", "Which workload?");
  expect(task.status).toBe("running"); // not blocked: a comparison goes on without that agent
  await k.engine.report(runOf(k, "w1.2"), "done", "B says LRU");
  const r = await waiting;
  expect(r.task.steps.map((s) => s.status)).toEqual(["failed", "done", "stopped"]);
  expect(r.text).toMatch(/^## Summary\n\nNo comparison: only one agent answered\.\n\n## a \(no answer\)\n\nNo runner left.*a·a1: Which workload\?\n\n## b\n\nB says LRU$/);
  expect(k.host.spawned.length).toBe(2);
});

test("compare: infra falls back inside the same agent only; nobody answering fails the task", async () => {
  const k = await makeEngine({ runners: three });
  const task = await k.engine.submit(compare({ with: ["a", "b"] }));
  const waiting = k.engine.wait(task);
  await settle();
  k.host.set("t1", { state: "finished", exit: 1 });
  k.host.set("t2", { state: "finished", exit: 1 });
  const { reconcile } = await import("./watch");
  await reconcile(k.engine);
  await settle();
  expect(k.host.spawned.map((s) => s.argv[2])).toEqual(["a1", "b1", "a2"]); // b has no second model; never borrows a's
  k.host.set("t3", { state: "finished", exit: 1 });
  await reconcile(k.engine);
  const r = await waiting;
  expect(r.task.status).toBe("failed");
  expect(r.text).toMatch(/## a \(no answer\)[\s\S]*## b \(no answer\)/);
});

test("compare: defaults to three distinct agents; needs two; refuses unknown or unable agents up front", async () => {
  const k = await makeEngine({ runners: three });
  const task = await k.engine.submit(compare());
  expect(task.steps.filter((s) => s.role === "research").map((s) => s.with)).toEqual([["a"], ["b"], ["c"]]);
  await expect(k.engine.submit(compare({ with: ["a"] }))).rejects.toThrow(/needs at least two agents/);
  await expect(k.engine.submit(compare({ with: ["a", "zz"] }))).rejects.toThrow(/unknown agent 'zz'/);
  const nobodyMedium = await makeEngine({ runners: [fakeRunner("a", ["a1"]), fakeRunner("b", ["b1"])] });
  await expect(nobodyMedium.engine.submit(compare())).rejects.toThrow(/no agent can do the summarize stage of 'compare' \(it needs: read, shell-report, tier medium\+\)/);
  const ro = await makeEngine({ runners: [fakeRunner("a", ["a1"]), fakeRunner("ro", ["r"], { enforces: ["read", "shell-report"] }), d] });
  await expect(ro.engine.submit(compare({ with: ["a", "ro"] }))).rejects.toThrow(/ro cannot do 'compare'/);
  const picked = (await ro.engine.submit(compare())).steps.filter((s) => s.role === "research").map((s) => s.with?.[0]);
  expect(picked).toEqual(["a", "d"]); // ro cannot research, so it is never picked
});
