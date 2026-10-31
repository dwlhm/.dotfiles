import { test, expect } from "bun:test";
import { engineLabels } from "../adapters/host/herdr/host";
import { engineName } from "./paths";
import { start, type Hc } from "./client";

/** A fake `hc`: answers `get` with `state` and `run` with an address, recording every call. */
function fakeHc(state = "finished"): { hc: Hc; calls: string[][] } {
  const calls: string[][] = [];
  const hc: Hc = async (args) => {
    calls.push(args);
    if (args[0] === "get") return { code: 0, out: JSON.stringify({ state }), err: "" };
    if (args[0] === "run") return { code: 0, out: JSON.stringify({ address: "t1" }), err: "" };
    return { code: 0, out: "", err: "" };
  };
  return { hc, calls };
}

test("herdr labels: the engine gets its own space and tab", () => {
  expect(engineLabels("wf")).toEqual({ "herdr.space": "wf", "herdr.tab": "wf" });
  expect(engineLabels("wf-1a2b3c4d")).toEqual({ "herdr.space": "wf-1a2b3c4d", "herdr.tab": "wf-1a2b3c4d" });
});

test("start: the wf serve terminal is labelled as its own herdr space and tab", async () => {
  const { hc, calls } = fakeHc();
  await start(hc);
  const run = calls.find((c) => c[0] === "run");
  expect(run).toBeDefined();
  const name = engineName();
  expect(run).toContain("--name");
  expect(run![run!.indexOf("--name") + 1]).toBe(name);
  expect(run).toContain("--label");
  expect(run).toContain(`herdr.space=${name}`);
  expect(run).toContain(`herdr.tab=${name}`);
  // Labels come before the command, like every other hc flag.
  expect(run!.indexOf(`herdr.tab=${name}`)).toBeLessThan(run!.indexOf("--"));
  expect(run!.slice(run!.indexOf("--") + 1)).toContain("serve");
});

test("start: a live engine is left alone", async () => {
  const { hc, calls } = fakeHc("live");
  await start(hc);
  expect(calls.map((c) => c[0])).toEqual(["get"]);
});

test("start: losing the race to another client is fine", async () => {
  let gets = 0;
  const calls: string[][] = [];
  const hc: Hc = async (args) => {
    calls.push(args);
    if (args[0] === "get") return { code: 0, out: JSON.stringify({ state: ++gets > 1 ? "live" : "finished" }), err: "" };
    if (args[0] === "run") return { code: 1, out: "", err: "already exists" };
    return { code: 0, out: "", err: "" };
  };
  await expect(start(hc)).resolves.toBeUndefined();
  expect(calls.some((c) => c[0] === "run")).toBe(true);
});

test("start: a real failure is reported with hc's message", async () => {
  const hc: Hc = async (args) => {
    if (args[0] === "get") return { code: 0, out: JSON.stringify({ state: "finished" }), err: "" };
    if (args[0] === "run") return { code: 1, out: "", err: "no such program" };
    return { code: 0, out: "", err: "" };
  };
  await expect(start(hc)).rejects.toThrow("could not start wf serve: no such program");
});
