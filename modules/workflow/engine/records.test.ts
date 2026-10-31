import { test, expect } from "bun:test";
import { loadSpec } from "./spec";
import { specDir } from "./cli";
import { checkTask } from "./records";
import { parseDoc, renderDoc } from "./frontmatter";

const spec = loadSpec(specDir());
const T0 = "2026-10-31T17:00:00Z";

const run = (id: string, over: object = {}) => ({
  id, runner: "opencode", model: "deepseek-v4.1-flash-free", terminal: "t21",
  started: T0, ended: "2026-10-31T17:05:00Z", outcome: "done", ...over,
});
const step = (id: string, over: object = {}) => ({
  id, title: "theme tokens", role: "implement", only: ["src/styles/**"], check: "bun test",
  deps: [], status: "done", runs: [run(`${id}-r1`)], steps: [], ...over,
});
const task = (over: object = {}) => ({
  id: "w12", command: "build", goal: "dark mode toggle", folder: "/Users/x/admin-v2",
  options: {}, status: "running", created: T0, closed: null,
  steps: [step("w12.1"), step("w12.2", { deps: ["w12.1"], status: "running", runs: [run("w12.2-r1", { ended: null, outcome: null })] })],
  answers: [], ...over,
});
const errs = (t: object) => checkTask("w12.md", t as Record<string, unknown>, spec);

test("a well-formed record is valid", () => {
  expect(errs(task())).toEqual([]);
});

test("record frontmatter survives a write and a read", () => {
  const t = task();
  const doc = parseDoc("w12.md", renderDoc(t, "# dark mode toggle"));
  expect(doc.data).toEqual(t);
  expect(doc.body).toBe("# dark mode toggle");
});

test("ids follow the task, in order, and runs are numbered", () => {
  const msg = errs(task({ steps: [step("w12.1"), step("w12.3", { runs: [run("w12.2-r2")] })] })).join("\n");
  expect(msg).toMatch(/w12\.2: id: is "w12\.3", expected w12\.2/);
  expect(msg).toMatch(/w12\.2 runs\[0\]: id: must be w12\.2-r1/);
});

test("deps must be other steps of the task, without cycles", () => {
  expect(errs(task({ steps: [step("w12.1", { deps: ["w9.1"] })] })).join()).toMatch(/deps: "w9\.1" is not another step/);
  expect(errs(task({ steps: [step("w12.1", { deps: ["w12.1"] })] })).join()).toMatch(/is not another step/);
  const loop = task({ steps: [step("w12.1", { deps: ["w12.2"] }), step("w12.2", { deps: ["w12.1"] })] });
  expect(errs(loop).join()).toMatch(/dependency cycle through w12\.1/);
});

test("a run's outcome is set exactly when it ended, from the vocab", () => {
  const msg = errs(task({ steps: [step("w12.1", { runs: [run("w12.1-r1", { ended: null }), ] })] })).join("\n");
  expect(msg).toMatch(/outcome: is set exactly when the run has ended/);
  expect(errs(task({ steps: [step("w12.1", { runs: [run("w12.1-r1", { outcome: "great" })] })] })).join()).toMatch(/outcome: unknown 'great'/);
});

test("sub-steps need a split parent and stay within plan_depth", () => {
  const nested = (depth: number): object =>
    step("w12.1" + ".1".repeat(depth - 1), { status: depth < 3 ? "split" : "done", steps: depth < 3 ? [nested(depth + 1)] : [] });
  expect(errs(task({ steps: [nested(1)] })).join()).toMatch(/w12\.1\.1: steps: nest deeper than plan_depth 2/);
  const unsplit = step("w12.1", { status: "running", steps: [step("w12.1.1")] });
  expect(errs(task({ steps: [unsplit] })).join()).toMatch(/w12\.1: status: a step with sub-steps must be 'split'/);
});

test("closed is set exactly for finished tasks; times are ISO", () => {
  expect(errs(task({ status: "done" })).join()).toMatch(/closed: is set exactly when the task is done/);
  expect(errs(task({ closed: T0 })).join()).toMatch(/closed: is set exactly/);
  expect(errs(task({ created: "yesterday" })).join()).toMatch(/created: must be an ISO date-time/);
});

test("unknown command, role or status, and a relative folder, are named", () => {
  const msg = errs(task({ command: "deploy", status: "maybe", folder: "admin-v2", steps: [step("w12.1", { role: "boss" })] })).join("\n");
  expect(msg).toMatch(/command: unknown 'deploy'/);
  expect(msg).toMatch(/status: unknown 'maybe'/);
  expect(msg).toMatch(/folder: must be an absolute path/);
  expect(msg).toMatch(/w12\.1: role: unknown 'boss'/);
});
