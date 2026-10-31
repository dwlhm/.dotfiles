// The engine's own status: what it aggregates over open tasks, how that becomes OSC 7501, and that
// it is written once at start and again only when the aggregate changes.
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "./records";
import { aggregate, encode } from "./osc";
import { makeEngine, settle } from "./testkit";
import { reconcile } from "./watch";
import { serve } from "./server";
import { request } from "./client";

const ask = { command: "ask", goal: "why is the build slow?", folder: "/tmp", options: {} };

const task = (id: string, status: string): Task => ({
  id,
  command: "ask",
  goal: "g",
  folder: "/tmp",
  options: {},
  status,
  created: "2026-10-31T17:00:00Z",
  closed: null,
  steps: [],
  answers: [],
});

/** The payload fields of one sequence, base64 left encoded. */
const fields = (seq: string): Record<string, string> => {
  const m = /^\x1b]7501;(.*)\x1b\\$/.exec(seq);
  if (!m) throw new Error(`not an OSC 7501 sequence: ${JSON.stringify(seq)}`);
  return Object.fromEntries(
    m[1].split(":").map((f) => {
      const i = f.indexOf("=");
      return [f.slice(0, i), f.slice(i + 1)];
    }),
  );
};
const decoded = (seq: string, field: string) => Buffer.from(fields(seq)[field]!, "base64").toString("utf8");

test("aggregate: waiting for a person outranks work in flight, which outranks idle", () => {
  expect(aggregate([])).toEqual({ state: "idle", msg: "no open tasks" });
  expect(aggregate([task("w1", "paused")])).toEqual({ state: "idle", msg: "1 task paused" });
  expect(aggregate([task("w1", "running")])).toEqual({ state: "working", msg: "1 task running" });
  expect(aggregate([task("w1", "running"), task("w2", "running")])).toEqual({ state: "working", msg: "2 tasks running" });
  expect(aggregate([task("w1", "running"), task("w2", "blocked")])).toEqual({ state: "blocked", kind: "question", msg: "w2 is blocked" });
  expect(aggregate([task("w1", "awaiting_approval"), task("w2", "blocked")])).toEqual({
    state: "blocked",
    kind: "question",
    msg: "w1 waits for approval",
  });
});

test("encode: one OSC 7501 sequence, base64 title and message, kind only while blocked", () => {
  expect(encode({ state: "idle", msg: "no open tasks" })).toBe("\x1b]7501;state=idle:app=wf:title=d2Y=:msg=bm8gb3BlbiB0YXNrcw==\x1b\\");
  const blocked = encode({ state: "blocked", kind: "question", msg: "w7 waits for approval" });
  expect(fields(blocked)).toEqual({ state: "blocked", app: "wf", title: "d2Y=", msg: Buffer.from("w7 waits for approval").toString("base64"), kind: "question" });
  expect(decoded(blocked, "title")).toBe("wf");
  expect(decoded(blocked, "msg")).toBe("w7 waits for approval");
  expect(fields(encode({ state: "working", msg: "2 tasks running" })).kind).toBeUndefined();
});

test("the engine writes its status at start and again only when the aggregate changes", async () => {
  const k = await makeEngine();
  const out: string[] = [];
  k.engine.d.write = (s) => out.push(s);

  k.engine.announce(true); // start
  expect(out).toEqual([encode({ state: "idle", msg: "no open tasks" })]);
  k.engine.announce(true); // a restarted engine reports once more
  expect(out).toHaveLength(2);

  const t = await k.engine.submit(ask);
  await settle();
  expect(out.at(-1)).toBe(encode({ state: "working", msg: "1 task running" }));
  k.engine.announce(); // nothing changed: nothing written
  expect(out).toHaveLength(3);

  t.status = "blocked";
  k.engine.announce();
  expect(out.at(-1)).toBe(encode({ state: "blocked", kind: "question", msg: "w1 is blocked" }));

  t.status = "running";
  await k.engine.report("w1.1-r1", "done", "Because of X.");
  expect(out.at(-1)).toBe(encode({ state: "idle", msg: "no open tasks" }));
});

test("a run that starts waiting for a person makes the engine report blocked", async () => {
  const k = await makeEngine();
  const out: string[] = [];
  k.engine.d.write = (s) => out.push(s);

  const t = await k.engine.submit(ask);
  await settle();
  k.host.set("t1", { status: { state: "working" } });
  await reconcile(k.engine);
  expect(out.at(-1)).toBe(encode({ state: "working", msg: "1 task running" }));

  k.host.set("t1", { status: { state: "blocked", kind: "question" } });
  await reconcile(k.engine);
  expect(t.status).toBe("blocked");
  expect(out.at(-1)).toBe(encode({ state: "blocked", kind: "question", msg: "w1 is blocked" }));
});

test("serve reports at start and follows a task from running to closed", async () => {
  const k = await makeEngine();
  const out: string[] = [];
  k.engine.d.write = (s) => out.push(s);
  const path = join(mkdtempSync(join(tmpdir(), "wf-osc-")), "wf.sock");
  const running = await serve(k.engine.d, path);
  expect(out).toEqual([encode({ state: "idle", msg: "no open tasks" })]);

  await request({ op: "submit", submit: ask, wait: false }, path);
  await settle();
  expect(out.at(-1)).toBe(encode({ state: "working", msg: "1 task running" }));

  await request({ op: "report", run: "w1.1-r1", outcome: "done", text: "42" }, path);
  expect(out.at(-1)).toBe(encode({ state: "idle", msg: "no open tasks" }));
  await running.stop();
});
