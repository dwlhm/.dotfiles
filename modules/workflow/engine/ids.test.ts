import { test, expect } from "bun:test";
import { parseId, formatId, parentId } from "./ids";
import { brainLayout, formatDecision, parseDecision } from "./brain";

test("task, step, nested step and run ids round-trip", () => {
  for (const s of ["w12", "w12.2", "w12.2.1", "w12.2-r2", "w3.10.1-r11"]) expect(formatId(parseId(s)!)).toBe(s);
  expect(parseId("w12.2-r2")).toEqual({ kind: "run", task: 12, path: [2], run: 2 });
});

test("malformed ids are rejected, never guessed", () => {
  for (const s of ["", "w", "w0", "w01", "w1.0", "w1-r1", "w1.2-r0", "W1", "w1.2r1", "t21", "w1..2"]) expect(parseId(s)).toBeNull();
});

test("parentId walks run → step → parent step → task", () => {
  expect(parentId("w12.2.1-r3")).toBe("w12.2.1");
  expect(parentId("w12.2.1")).toBe("w12.2");
  expect(parentId("w12.2")).toBe("w12");
  expect(parentId("w12")).toBeNull();
  expect(parentId("nope")).toBeNull();
});

test("brain layout groups task records by month and lists what may be committed", () => {
  const b = brainLayout("/b");
  expect(b.taskRecord("w12", "2026-10-31T17:00:00Z")).toBe("/b/tasks/2026-10/w12.md");
  expect(b.projectFile("admin-v2.md")).toBe("/b/projects/admin-v2.md");
  expect(b.commitPaths).toEqual(["projects", "knowledge", "tasks", "decisions.md"]);
});

test("a decision is one line that round-trips with its scope and source", () => {
  const d = { date: "2026-10-31", scope: "project" as const, text: "theme preference lives in localStorage", from: "w12" };
  const line = formatDecision(d);
  expect(line).toBe("- 2026-10-31 · project · theme preference lives in localStorage (from w12)");
  expect(parseDecision(line)).toEqual(d);
  expect(() => formatDecision({ ...d, text: "two\nlines" })).toThrow();
  expect(parseDecision("- 2026-10-31 · team · x (from w12)")).toBeNull();
  expect(parseDecision("- some note")).toBeNull();
});
