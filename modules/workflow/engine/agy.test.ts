import { test, expect } from "bun:test";
import { allowedCommand, decide } from "../adapters/runners/agy/guard";
import { commands, hook, launch } from "../adapters/runners/agy/runner";

const research = { can: ["read", "shell-git-read", "shell-report"], commands: commands(["read", "shell-git-read", "shell-report"]) };
const call = (name: string, args?: unknown) => ({ toolCall: { name, args } });

test("commands: every part must start with an allowed prefix; wf report's text is data", () => {
  const p = research.commands;
  expect(allowedCommand("git status --short", p)).toBe(true);
  expect(allowedCommand("cd /Users/x/.dotfiles && git log -5", p)).toBe(true);
  expect(allowedCommand("git diff && git status", p)).toBe(true);
  expect(allowedCommand("wf report w1.1-r1 done <<'WF'\nuses; && | > freely\nWF", p)).toBe(true);
  expect(allowedCommand("git status; touch x", p)).toBe(false);
  expect(allowedCommand("git log | head -5", p)).toBe(false);
  expect(allowedCommand("git log > out.txt", p)).toBe(false);
  expect(allowedCommand("git show $(rm -rf x)", p)).toBe(false);
  expect(allowedCommand("gitk", p)).toBe(false);
  expect(allowedCommand("wf report x done y", ["git status"])).toBe(false);
});

test("tools: control and read pass; edit, network and the unknown are denied for a read-only role", () => {
  expect(decide(call("task_boundary"), research)).toBeNull();
  expect(decide(call("view_file", { AbsolutePath: "/x" }), research)).toBeNull();
  expect(decide(call("grep_search"), research)).toBeNull();
  expect(decide(call("write_to_file"), research)).toMatch(/does not edit files/);
  expect(decide(call("replace_file_content"), research)).toMatch(/does not edit files/);
  expect(decide(call("read_url_content"), research)).toMatch(/no network access/);
  expect(decide(call("browser_open"), research)).toMatch(/no network access/);
  expect(decide(call("mcp_github_create_issue"), research)).toMatch(/not allowed for wf workers/);
  expect(decide({}, research)).toMatch(/unknown tool is not allowed/);
  const editor = { can: ["read", "edit", "shell-report"], commands: ["wf report"] };
  expect(decide(call("write_to_file"), editor)).toBeNull();
});

test("run_command: the command is read from its args, whatever their shape; unreadable is denied", () => {
  expect(decide(call("run_command", { CommandLine: "git status" }), research)).toBeNull();
  expect(decide(call("run_command", JSON.stringify({ command: "git status" })), research)).toBeNull();
  expect(decide(call("run_command", { CommandLine: "touch made" }), research)).toMatch(/may only run: wf report, git status.*\(got: touch made\)/);
  expect(decide(call("run_command", { Cwd: "/x", Blocking: true }), research)).toMatch(/cannot read the command \(args: Cwd, Blocking\)/);
});

test("launch: per-session trust and allowed commands, and the guard's policy in env", () => {
  const l = launch({ model: "gemini-3.8-flash-low", prompt: "P", cwd: "/w", can: research.can });
  expect(l.argv.slice(0, 4)).toEqual(["agy", "--model", "gemini-3.8-flash-low", "--settings"]);
  expect(JSON.parse(l.argv[4])).toEqual({ trustedWorkspaces: ["/w"], permissions: { allow: research.commands.map((c) => `command(${c})`) } });
  expect(l.argv.slice(5)).toEqual(["-i", "P"]);
  expect(JSON.parse(l.env!.WF_GUARD)).toEqual(research);
});

test("hook: silent outside wf runs; a deny reply names the policy; broken input fails closed", () => {
  const env = { WF_GUARD: JSON.stringify(research) };
  expect(hook(JSON.stringify(call("run_command", { CommandLine: "touch x" })), {})).toBe("");
  expect(hook(JSON.stringify(call("run_command", { CommandLine: "git status" })), env)).toBe("");
  expect(JSON.parse(hook(JSON.stringify(call("run_command", { CommandLine: "touch x" })), env))).toMatchObject({ decision: "deny", reason: expect.stringMatching(/^wf policy: /) });
  expect(() => hook("not json", env)).toThrow(); // wf hook turns this into a deny (fail closed)
});
