import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { loadSpec } from "./spec";
import { specDir, unescape } from "./cli";
import { parseCommand, UsageError } from "./args";
import { renderPrompt, PRIVATE_NOTE } from "./prompt";
import { choices, loadRunners } from "./runners";
import { commitSnapshot } from "./gitsnap";
import { engineName, withEnv } from "./paths";
import { scratchBrain, fakeRunner } from "./testkit";
import { brainKnowledge, projectFor } from "../adapters/knowledge/brain/knowledge";
import { launch, permissions } from "../adapters/runners/opencode/runner";
import * as claude from "../adapters/runners/claude/runner";

const spec = loadSpec(specDir());
const git = async (root: string, ...a: string[]) => (await new Response(Bun.spawn(["git", "-C", root, ...a], { stdout: "pipe" }).stdout).text()).trim();
const parse = (argv: string[], env: Record<string, string> = {}) => parseCommand(spec, argv, "/tmp", env);

test("args: options take their concrete argument; folders resolve and must exist", () => {
  const s = parse(["ask", "why slow?", "about", "src/a", "src/b", "in", "~", "with", "opencode", "report-to", "me"], { HC_TERMINAL_ID: "t7" });
  expect(s).toEqual({ command: "ask", goal: "why slow?", folder: homedir(), options: { about: ["src/a", "src/b"], with: ["opencode"], "report-to": "t7" } });
  expect(parse(["ask", "q", "--in", "."]).folder).toBe("/tmp");
  expect(() => parse(["ask", "q", "in", "/no/such/dir"])).toThrow(/no such folder/);
  expect(() => parse(["ask", "q", "in", "a", "b"])).toThrow(/takes one folder.*quote it/);
});

test("args: mistakes are explained, never guessed", () => {
  expect(() => parse(["ask"])).toThrow(/what should 'ask' do\? e\.g\. wf ask "why is the build slow\?"/);
  expect(() => parse(["ask", "about", "x"])).toThrow(UsageError);
  expect(() => parse(["ask", "q", "only", "src"])).toThrow(/'only' is not an option of 'ask' \(options: in, about, with, report-to\)/);
  expect(() => parse(["review", "PR", "#42"])).toThrow(/Quote it with what comes before: wf review "PR #42"/);
  expect(() => parse(["ask", "q", "about"])).toThrow(/'about' needs one or more paths/);
  expect(() => parse(["ask", "q", "about", "a", "about", "b"])).toThrow(/given twice/);
  expect(() => parse(["ask", "q", "report-to", "me"])).toThrow(/only inside an hc terminal/);
  expect(() => parse(["fix", "x", "ask-first", "just-go"])).toThrow(/contradict/);
  expect(() => parse(["fix", "x", "just-go", "now"])).toThrow(/takes nothing/);
});

test("prompt: variables, private context and report commands from the vocab", () => {
  const role = spec.roles.get("research")!;
  const p = renderPrompt({ role, vocab: spec.vocab, vars: { question: "Q?", about: ["a", "b"] }, context: [{ source: "projects/x.md", heading: "Core", text: "secret rule" }], run: "w3.1-r2", multiline: true });
  expect(p).toContain("Question: Q?\nLook at: a, b");
  expect(p).toContain(`<private-context>\n${PRIVATE_NOTE}\n\n### projects/x.md › Core\nsecret rule\n</private-context>`);
  expect(p).toContain(`wf report w3.1-r2 question "<text>"   # ${spec.vocab.outcomes.get("question")!.about}`);
  expect(p).not.toContain("too_big");
  expect(renderPrompt({ role, vocab: spec.vocab, vars: { question: "Q", about: [] }, context: [], run: "w1.1-r1", multiline: true })).not.toContain("private-context");
  const one = renderPrompt({ role, vocab: spec.vocab, vars: { question: "Q", about: [] }, context: [], run: "w1.1-r1", multiline: false });
  expect(one).toContain('wf report w1.1-r1 done --escaped "<text>"');
  expect(one).toContain("ONE line");
  expect(one).not.toContain("<<'WF'");
  expect(unescape("a\\nb\\tc\\\\n")).toBe("a\nb\tc\\n");
  expect(() => renderPrompt({ role, vocab: spec.vocab, vars: { question: "Q" }, context: [], run: "w1.1-r1", multiline: true })).toThrow(/needs 'about'/);
});

test("runners: the shipped adapters load; eligibility needs every capability; cheapest tier first", async () => {
  const runners = await loadRunners(spec);
  expect([...runners.keys()]).toEqual(["agy", "claude", "opencode"]);
  // Cheapest first inside the role's tier, then one tier up; ties keep runner then model order.
  expect(choices(spec.roles.get("research")!, runners, spec.vocab.tiers).map((c) => c.model.id)).toEqual([
    "opencode/deepseek-v4.1-flash-free",
    "opencode/beam-free",
    "gemini-3.8-flash-low",
    "gemini-3.8-flash-medium",
    "claude-haiku-5-5",
    "gemini-4-argon-medium",
    "claude-sonnet-5-5",
    "gemini-4-argon-high",
    "claude-opus-5-5",
  ]);
  const plan = spec.roles.get("plan")!; // medium
  const cheap = fakeRunner("cheap", ["s"]);
  const mid = fakeRunner("mid", ["m"], { models: [{ id: "m", tier: "medium", cost: 5 }, { id: "l", tier: "large", cost: 1 }] });
  const blind = fakeRunner("blind", ["x"], { enforces: ["read", "shell-report"], models: [{ id: "x", tier: "medium", cost: 0 }] });
  const all = new Map([cheap, mid, blind].map((r) => [r.name, r]));
  expect(choices(plan, all, spec.vocab.tiers).map((c) => c.model.id)).toEqual(["m", "l"]);
  expect(choices(spec.roles.get("research")!, all, spec.vocab.tiers, ["mid"]).map((c) => c.model.id)).toEqual(["m", "l"]);
});

test("opencode: capabilities become allow rules, everything else is denied", () => {
  expect(permissions(["read", "shell-git-read", "shell-report"])).toEqual({
    edit: "deny",
    webfetch: "deny",
    bash: {
      "*": "deny",
      "wf report *": "allow",
      ...Object.fromEntries(["status", "log", "diff", "show", "ls-files", "grep", "blame", "rev-parse"].map((c) => [`git ${c}*`, "allow"])),
    },
  });
  expect(permissions(["edit", "shell-check", "shell-report"], "bun test")).toMatchObject({ edit: "allow", bash: { "bun test": "allow" } });
  const l = launch({ model: "opencode/m", prompt: "P", cwd: "/w", can: ["read", "shell-report"] });
  expect(l.argv).toEqual(["opencode", "--standalone", "--prompt", "P"]);
  expect(JSON.parse(l.env!.OPENCODE_CONFIG_CONTENT).model).toBe("opencode/m");
  expect(withEnv(["wf", "serve"], { A: "1", B: "x y" })).toEqual(["env", "A=1", "B=x y", "wf", "serve"]);
  expect(withEnv(["wf"], {})).toEqual(["wf"]);
  const saved = process.env.WF_STATE;
  delete process.env.WF_STATE;
  expect(engineName()).toBe("wf");
  process.env.WF_STATE = "/a";
  const a = engineName();
  process.env.WF_STATE = "/b";
  expect(a).toMatch(/^wf-[0-9a-f]{8}$/);
  expect(engineName()).not.toBe(a);
  if (saved === undefined) delete process.env.WF_STATE;
  else process.env.WF_STATE = saved;
});

test("knowledge: the project's invariants always, relevant topics only, within budget", async () => {
  const root = mkdtempSync(join(tmpdir(), "wf-kb-"));
  mkdirSync(join(root, "projects"));
  mkdirSync(join(root, "knowledge"));
  writeFileSync(join(root, "projects/README.md"), "| `/srv` | `outer.md` |\n| `/srv/app` | `app.md` |\n");
  writeFileSync(join(root, "projects/app.md"), "# App\n\n## Commands\n- build with make\n\n## Core invariants\n- never X\n");
  writeFileSync(join(root, "knowledge/README.md"), "| Topic | File |\n|---|---|\n| Nix flakes and builds | `nix.md` |\n| Swift UI | `swift.md` |\n");
  writeFileSync(join(root, "knowledge/nix.md"), "# Nix\n\n## Slow builds\nflake builds are slow when the store is cold\n\n## Secrets\nsops\n");
  writeFileSync(join(root, "knowledge/swift.md"), "# Swift\n\n## Views\nbuilds views\n");
  expect(projectFor(root, "/srv/app/src")).toBe("app.md");
  expect(projectFor(root, "/srvx")).toBeNull();
  const kb = brainKnowledge(root);
  const got = kb.context({ folder: "/srv/app", paths: ["flake.nix"], goal: "why are nix builds slow?", budget: 10_000 });
  expect(got.map((s) => `${s.source} › ${s.heading}`)).toEqual(["projects/app.md › Core invariants", "knowledge/nix.md › Slow builds", "knowledge/nix.md › Nix", "projects/app.md › App", "projects/app.md › Commands"]);
  const tiny = kb.context({ folder: "/srv/app", paths: [], goal: "nix builds", budget: 30 });
  expect(tiny.map((s) => s.heading)).toEqual(["Core invariants"]);
  expect(tiny[0].text.length).toBeLessThanOrEqual(30);
  expect(kb.context({ folder: "/elsewhere", paths: [], goal: "swift views", budget: 10_000 }).map((s) => s.source)).toEqual(["knowledge/swift.md", "knowledge/swift.md"]);
});

test("gitsnap commits exactly the given content and leaves the user's staged work alone", async () => {
  const root = await scratchBrain();
  writeFileSync(join(root, "mine.md"), "user draft");
  await Bun.spawn(["git", "-C", root, "add", "mine.md"]).exited;
  mkdirSync(join(root, "tasks"));
  writeFileSync(join(root, "tasks/w1.md"), "newer on disk");
  expect(await commitSnapshot(root, [{ rel: "tasks/w1.md", content: "milestone A" }], "m: A")).toBe(true);
  expect(await commitSnapshot(root, [{ rel: "tasks/w1.md", content: "milestone A" }], "m: again")).toBe(false);
  expect(await git(root, "show", "HEAD:tasks/w1.md")).toBe("milestone A");
  expect(await git(root, "log", "--format=%s")).toBe("m: A\ninit");
  expect(await git(root, "diff", "--cached", "--name-only")).toBe("mine.md");
  expect(await git(root, "status", "--porcelain", "--", "tasks")).toBe("M tasks/w1.md") // modified in the work tree (output is trimmed);
});

test("claude: only the role's tools exist, unlisted calls are denied, trust is read and inherited", () => {
  const ro = claude.permissions(["read", "shell-git-read", "shell-report"]);
  expect(ro.tools).toEqual(["Read", "Grep", "Glob", "Bash"]);
  expect(ro.allow).toContain("Bash(wf report:*)");
  expect(ro.allow).toContain("Bash(git ls-files:*)");
  expect(ro.tools).not.toContain("Edit");
  const rw = claude.permissions(["read", "edit", "shell-check", "shell-report"], "bun test");
  expect(rw.tools).toEqual(["Read", "Grep", "Glob", "Bash", "Edit", "Write"]);
  expect(rw.allow).toContain("Bash(bun test)");
  const argv = claude.launch({ model: "claude-haiku-5-5", prompt: "P", cwd: "/w", can: ["read", "shell-report"] }).argv;
  expect(argv.slice(0, 8)).toEqual(["claude", "--model", "claude-haiku-5-5", "--restricted", "--strict-mcp-config", "--permission-mode", "dontAsk", "--tools"]);
  expect(argv.slice(-2)).toEqual(["--", "P"]);
  const cfg = join(mkdtempSync(join(tmpdir(), "wf-cl-")), "claude.json");
  writeFileSync(cfg, JSON.stringify({ projects: { "/srv/app": { hasTrustDialogAccepted: true }, "/srv/x": { hasTrustDialogAccepted: false } } }));
  expect(claude.trusted("/srv/app/src/deep", cfg)).toBe(true);
  expect(claude.trusted("/srv/x", cfg)).toBe(false);
  expect(claude.trusted("/srv", cfg)).toBe(false);
  expect(claude.trusted("/srv/app", join(tmpdir(), "missing.json"))).toBe(false);
});

test("herdr host: the engine's place is renamed; the board is made once, then selected", async () => {
  const { presentEngine, openBoard } = await import("../adapters/host/herdr/host");
  const calls: string[] = [];
  let tabs = [{ id: "wf", name: "engine" }];
  const app = async (args: string[]) => {
    calls.push(args.join(" "));
    if (args[0] === "ls") return { code: 0, out: JSON.stringify({ spaces: [{ id: "wf", tabs }] }) };
    if (args[1] === "tab.new") tabs = [...tabs, { id: "tb2", name: "board" }];
    return { code: 0, out: "{}" };
  };
  let shown = false; // Herdr shows the engine's tab only after a moment
  const late = async (args: string[]) => (args[0] === "ls" && !shown ? ((shown = true), { code: 0, out: JSON.stringify({ spaces: [] }) }) : app(args));
  expect(await presentEngine("wf", late, async () => {})).toBe(true);
  expect(calls).toEqual(["ls", "do space.rename --id wf --name wf", "do tab.rename --id wf --name engine"]);
  expect(await presentEngine("wf", async () => ({ code: 1, out: "" }), async () => {})).toBe(false);
  calls.length = 0;
  expect(await openBoard("wf", app)).toBe("board open in the wf space");
  expect(calls.at(-1)).toBe("do tab.new --space wf --mod wf-board --name board");
  await openBoard("wf", app);
  expect(calls.at(-1)).toBe("do tab.select --id tb2"); // the second time: no new tab
  expect(await openBoard("wf", async () => ({ code: 1, out: "" }))).toMatch(/Herdr is not running/);
  expect(await openBoard("wf-x", app)).toMatch(/no space in Herdr yet/);
});
