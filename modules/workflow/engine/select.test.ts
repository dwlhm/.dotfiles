import { test, expect } from "bun:test";
import { select, type Selected } from "./select";
import type { Run, Step, Task } from "./records";
import { loadSpec } from "./spec";
import { specDir } from "./cli";

const run = (id: string, over: Partial<Run> = {}): Run => ({
  id,
  runner: "oc",
  model: "m1",
  terminal: "t1",
  started: "2026-10-31T17:00:00Z",
  ended: null,
  outcome: null,
  ...over,
});
const step = (id: string, title: string, over: Partial<Step> = {}): Step => ({
  id,
  title,
  role: "implement",
  only: [],
  deps: [],
  status: "queued",
  runs: [],
  steps: [],
  ...over,
});
const task = (id: string, goal: string, steps: Step[] = [], over: Partial<Task> = {}): Task => ({
  id,
  command: "build",
  goal,
  folder: "/w",
  options: {},
  status: "running",
  created: "2026-10-31T17:00:00Z",
  closed: null,
  steps,
  answers: [],
  ...over,
});

const tasks = () => [
  task("w1", "Implement the control commands", [
    step("w1.1", "Add the stopped outcome", {
      runs: [run("w1.1-r1", { ended: "2026-10-31T17:01:00Z", outcome: "done" }), run("w1.1-r2")],
    }),
    step("w1.2", "Implement target selection", { status: "split", steps: [step("w1.2.1", "Extend Active for taken runs")] }),
  ]),
  task("w2", "Review the control commands", [step("w2.1", "Review target selection")]),
];

const ids = (s: Selected) => ("error" in s ? s.error : [s.task.id, s.step?.id, s.run?.id].filter(Boolean).join(" > "));

test("an id picks the task, step, nested step or run it names", () => {
  const t = tasks();
  expect(ids(select(t, "w1"))).toBe("w1");
  expect(ids(select(t, " w1.2 "))).toBe("w1 > w1.2");
  expect(ids(select(t, "w1.2.1"))).toBe("w1 > w1.2.1");
  expect(ids(select(t, "w1.1-r2"))).toBe("w1 > w1.1 > w1.1-r2");
  expect(select(t, "w1.1-r1")).toEqual({ task: t[0], step: t[0].steps[0], run: t[0].steps[0].runs[0] });
});

test("an unknown id says what that task or step does have", () => {
  const t = tasks();
  expect(ids(select(t, "w9"))).toBe("no open task w9 (open: w1: Implement the control commands; w2: Review the control commands)");
  expect(ids(select(t, "w1.7"))).toBe(
    "w1 has no step w1.7 (its steps: w1.1: Add the stopped outcome; w1.2: Implement target selection; w1.2.1: Extend Active for taken runs)",
  );
  expect(ids(select(t, "w1.1-r9"))).toBe("w1.1 has no run w1.1-r9 (its runs: w1.1-r1: oc·m1 done; w1.1-r2: oc·m1 running)");
});

test("words match a goal or step title, case-insensitively and at any depth", () => {
  const t = tasks();
  expect(ids(select(t, "EXTEND ACTIVE"))).toBe("w1 > w1.2.1");
  expect(ids(select(t, "stopped"))).toBe("w1 > w1.1");
  expect(ids(select(t, "review target"))).toBe("w2 > w2.1");
  expect(ids(select(t, "the control commands"))).toBe("'the control commands' matches more than one: w1: Implement the control commands; w2: Review the control commands");
});

test("ambiguity and no match list every candidate as id: title", () => {
  const t = tasks();
  expect(ids(select(t, "target selection"))).toBe(
    "'target selection' matches more than one: w1.2: Implement target selection; w2.1: Review target selection",
  );
  expect(ids(select(t, "deploy"))).toBe(
    "nothing matches 'deploy' (open: w1: Implement the control commands; w2: Review the control commands)",
  );
  expect(ids(select([], "deploy"))).toBe("nothing matches 'deploy' (there are no open tasks)");
  expect(ids(select(t, "   "))).toBe("nothing to select: give a task, step or run id, or words from a goal or title");
});

test("closed tasks are neither selectable nor matched", () => {
  const t = [...tasks(), task("w3", "Control commands, closed", [], { status: "done", closed: "2026-10-31T17:02:00Z" })];
  expect(ids(select(t, "w3"))).toBe("no open task w3 (open: w1: Implement the control commands; w2: Review the control commands)");
  const hit = ids(select(t, "control commands"));
  expect(hit).not.toContain("w3");
  expect(ids(select([task("w4", "Fix w7 later")], "w7"))).toBe("no open task w7 (open: w4: Fix w7 later)");
});

test("select only reads the tasks it is given", () => {
  const t = tasks();
  const before = JSON.stringify(t);
  select(t, "target selection");
  select(t, "w1.1");
  expect(JSON.stringify(t)).toBe(before);
});

test("the vocab has the engine's stopped outcome", () => {
  expect(loadSpec(specDir()).vocab.outcomes.get("stopped")).toEqual({ by: "engine", about: "The user stopped the task" });
});
