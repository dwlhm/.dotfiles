import { beforeEach, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./cli";
import { fakeSys } from "./fake";
import { Board } from "./ops";

let sys: ReturnType<typeof fakeSys>;
let b: Board;
beforeEach(async () => {
  sys = fakeSys(await mkdtemp(join(tmpdir(), "board-")));
  b = new Board(sys);
});
const sent = () => sys.calls.filter((c) => c[1] === "send").map((c) => [c[2], c[3]]);
const prompt = () => sys.calls.find((c) => c[1] === "run")!.at(-1)!;

test("a plan-first task's agent is told to plan, and the board holds it out of the work", async () => {
  const t = await b.add({ title: "dark mode", agent: "claude", plan_first: true });
  expect(t).toMatchObject({ phase: "plan", approval: "pending" });
  expect(prompt()).toContain("board report plan");
  sys.as("t1");
  for (const step of ["work", "review", "test"]) await expect(b.phase(step)).rejects.toThrow("T1 is plan first");
  await expect(b.report("done", "toggle added")).rejects.toThrow("T1 is plan first");
  expect((await b.phase("plan", "reading the code")).phase).toBe("plan");
  expect((await b.report("question", "Which colour?")).phase).toBe("waiting");
});

test("the plan waits for the person; an answer asks for a new plan, approve starts the work", async () => {
  await b.add({ title: "dark mode", agent: "claude", plan_first: true });
  sys.as("t1");
  await expect(main(["approve", "T1"], sys)).rejects.toThrow("is for the person");
  const t = await b.report("plan", "Add a toggle in settings", { detail: "**Plan**\n1. ui.js" });
  expect(t).toMatchObject({ phase: "waiting", waiting_on: "user", report: { status: "plan", headline: "Add a toggle in settings" } });

  sys.as(undefined);
  expect((await b.answer("T1", "keep it in the header")).phase).toBe("plan");
  await expect(b.approve("T1")).rejects.toThrow("no plan to approve");
  sys.as("t1");
  await expect(b.phase("work")).rejects.toThrow("plan first");
  await b.report("plan", "Add a toggle in the header");

  sys.as(undefined);
  const ok = JSON.parse(await main(["approve", "T1", "--json"], sys));
  expect(ok).toMatchObject({ phase: "work", approval: "approved", waiting_on: null, report: null });
  expect(sent().at(-1)).toEqual(["t1", expect.stringMatching(/^\[board\] user approve: your plan is approved/)]);
  sys.as("t1");
  expect((await b.phase("test")).phase).toBe("test");
  expect((await b.report("done", "toggle added")).phase).toBe("done");
});

test("plan first comes from --plan, follows a fork, never reaches sub-tasks", async () => {
  const t = JSON.parse(await main(["add", "--plan", "--json", "--", "x"], sys));
  expect(t.approval).toBe("pending");
  expect((await b.add({ title: "y" })).approval).toBeNull();
  expect((await b.fork("T1", { plan_first: true })).approval).toBe("pending");
  await b.assign("T1", "claude");
  sys.as("t1");
  expect((await b.sub({ title: "ui", plan_first: true })).approval).toBeNull();
});
