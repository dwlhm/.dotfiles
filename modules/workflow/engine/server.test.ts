import { test, expect } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:net";
import { makeEngine, settle } from "./testkit";
import { serve } from "./server";
import { request, NotRunning } from "./client";
import { VERSION } from "./paths";

const sock = () => join(mkdtempSync(join(tmpdir(), "wf-s-")), "wf.sock");
const ask = { command: "ask", goal: "q?", folder: "/tmp", options: {} };

test("submit waits for the answer that a worker reports over the same socket", async () => {
  const k = await makeEngine();
  const path = sock();
  const running = await serve(k.engine.d, path);
  expect(await request({ op: "ping" }, path)).toEqual({ ok: true, active: 0, version: VERSION });
  const answer = request({ op: "submit", submit: ask, wait: true }, path);
  await settle();
  expect(await request({ op: "report", run: "w1.1-r1", outcome: "done", text: "42" }, path)).toEqual({ ok: true });
  expect(await answer).toEqual({ ok: true, task: "w1", status: "done", text: "42" });
  expect(await request({ op: "report", run: "w1.1-r1", outcome: "done", text: "x" }, path)).toMatchObject({ ok: false, error: expect.stringMatching(/not active/) });
  expect(await request({ op: "submit", submit: { ...ask, command: "deploy" }, wait: false }, path)).toMatchObject({ ok: false, error: "unknown command 'deploy'" });
  await running.stop();
  expect(existsSync(path)).toBe(false);
});

test("a second engine refuses to start; a stale socket from a crashed one is cleared", async () => {
  const k = await makeEngine();
  const path = sock();
  const first = await serve(k.engine.d, path);
  await expect(serve(k.engine.d, path)).rejects.toThrow(/already running/);
  await first.stop();
  writeFileSync(path, ""); // what a killed engine leaves behind
  const again = await serve(k.engine.d, path);
  expect((await request({ op: "ping" }, path)).ok).toBe(true);
  await again.stop();
  await expect(serve(k.engine.d, join("/tmp", "x".repeat(100), "wf.sock"))).rejects.toThrow(/over the 103-byte limit/);
});

test("nothing listening is NotRunning (safe to start and resend); garbage gets an error reply", async () => {
  const path = sock();
  await expect(request({ op: "ping" }, path)).rejects.toBeInstanceOf(NotRunning);
  const k = await makeEngine();
  const running = await serve(k.engine.d, path);
  const reply = await new Promise<string>((resolve) => {
    let buf = "";
    const c = connect(path, () => c.write("{not json\n"));
    c.on("data", (d) => (buf += d));
    c.on("close", () => resolve(buf));
  });
  expect(JSON.parse(reply)).toEqual({ ok: false, error: "malformed request" });
  expect(await request({ op: "nope" }, path)).toEqual({ ok: false, error: "unknown request 'nope'" });
  await running.stop();
});

test("quit is refused while runs are active and stops an idle engine", async () => {
  const k = await makeEngine();
  const path = sock();
  const running = await serve(k.engine.d, path);
  await request({ op: "submit", submit: ask, wait: false }, path);
  await settle();
  expect(await request({ op: "quit" }, path)).toEqual({ ok: false, error: "1 run(s) still active" });
  await request({ op: "report", run: "w1.1-r1", outcome: "done", text: "ok" }, path);
  expect(await request({ op: "quit" }, path)).toEqual({ ok: true });
  await running.done;
  expect(existsSync(path)).toBe(false);
  await expect(request({ op: "ping" }, path)).rejects.toBeInstanceOf(NotRunning);
});
