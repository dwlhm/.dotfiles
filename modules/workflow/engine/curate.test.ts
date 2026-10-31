import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFacts } from "./facts";
import { recordFacts, FACTS_HEADING, appendUnder } from "../adapters/knowledge/brain/record";
import { brainKnowledge } from "../adapters/knowledge/brain/knowledge";
import { makeEngine, scratchBrain, until } from "./testkit";

const sh = async (dir: string, ...a: string[]) => (await new Response(Bun.spawn(["git", "-C", dir, ...a], { stdout: "pipe", stderr: "pipe" }).stdout).text()).trim();

test("facts: nothing, entries in the two forms, and anything else dropped and counted", () => {
  expect(parseFacts("nothing")).toEqual({ facts: [], dropped: 0 });
  expect(parseFacts("`nothing`.")).toEqual({ facts: [], dropped: 0 });
  expect(parseFacts("project: make test needs the docker daemon\n- topic Git: rebase --autosquash needs fixup! prefixes\nI think we should refactor")).toEqual({
    facts: [
      { scope: "project", text: "make test needs the docker daemon" },
      { scope: "topic", topic: "git", text: "rebase --autosquash needs fixup! prefixes" },
    ],
    dropped: 1,
  });
});

async function brain(): Promise<string> {
  const root = await scratchBrain();
  mkdirSync(join(root, "knowledge"));
  writeFileSync(join(root, "projects/README.md"), "| Project path | File |\n|---|---|\n| `/srv/app` | `app.md` |\n");
  writeFileSync(join(root, "projects/app.md"), "# App\n\n## Core invariants (never violate)\n\n1. never X\n\n## Commands\n\n- make\n");
  writeFileSync(join(root, "knowledge/README.md"), "# K\n\n| Topic | File |\n|---|---|\n| Git | `git.md` |\n\nRules: verified only.\n");
  writeFileSync(join(root, "knowledge/git.md"), "# Git\n\n- one fact\n");
  await sh(root, "add", "-A");
  await sh(root, "commit", "-qm", "brain");
  return root;
}

test("record: appended under the facts section or a topic file, never anywhere else; one exact commit", async () => {
  const root = await brain();
  writeFileSync(join(root, "draft.md"), "user's draft");
  await sh(root, "add", "draft.md");
  const o = { source: "w3.1-r2", date: "2026-10-31" };
  const r = await recordFacts(root, "app.md", [
    { scope: "project", text: "make test needs docker" },
    { scope: "topic", topic: "git", text: "worktrees share refs" },
    { scope: "topic", topic: "bun", text: "Bun.YAML is built in" },
    { scope: "project", text: "Make test needs Docker" }, // same fact, other case
  ], o);
  expect(r.applied).toEqual(["projects/app.md: make test needs docker", "knowledge/git.md: worktrees share refs", "knowledge/bun.md: Bun.YAML is built in"]);
  expect(r.skipped).toEqual(["Make test needs Docker (already known)"]);
  const app = readFileSync(join(root, "projects/app.md"), "utf8");
  expect(app).toBe(`# App\n\n## Core invariants (never violate)\n\n1. never X\n\n## Commands\n\n- make\n\n${FACTS_HEADING}\n\n- make test needs docker (verified 2026-10-31, w3.1-r2)\n`);
  expect(readFileSync(join(root, "knowledge/git.md"), "utf8")).toBe("# Git\n\n- one fact\n- worktrees share refs (verified 2026-10-31, w3.1-r2)\n");
  expect(readFileSync(join(root, "knowledge/bun.md"), "utf8")).toBe("# bun\n- Bun.YAML is built in (verified 2026-10-31, w3.1-r2)\n");
  expect(readFileSync(join(root, "knowledge/README.md"), "utf8")).toContain("| Git | `git.md` |\n| bun (from wf) | `bun.md` |\n\nRules");
  expect(await sh(root, "log", "-1", "--format=%s")).toBe("docs(brain): wf w3.1-r2 facts");
  expect((await sh(root, "show", "--name-only", "--format=", "HEAD")).split("\n").sort()).toEqual(["knowledge/README.md", "knowledge/bun.md", "knowledge/git.md", "projects/app.md"]);
  expect(await sh(root, "diff", "--cached", "--name-only")).toBe("draft.md"); // the user's staged work stays theirs
  const none = await recordFacts(root, null, [{ scope: "project", text: "x" }], o);
  expect(none.skipped).toEqual(["x (no project file for this folder)"]);
});

test("appendUnder: an existing facts section grows before the next section", () => {
  const md = `# A\n\n${FACTS_HEADING}\n\n- old\n\n## Later\n\ntext\n`;
  expect(appendUnder(md, FACTS_HEADING, "- new")).toBe(`# A\n\n${FACTS_HEADING}\n\n- old\n- new\n\n## Later\n\ntext\n`);
});

async function repo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "wf-cur-"));
  for (const a of [["init", "-q", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]]) await sh(dir, ...a);
  writeFileSync(join(dir, "a.txt"), "1\n");
  await sh(dir, "add", "-A");
  await sh(dir, "commit", "-qm", "init");
  return dir;
}

test("fix → curate: evidence holds the failed attempts; facts land in the brain; a stuck curator never fails the task", async () => {
  const dir = await repo();
  const root = await brain();
  writeFileSync(join(root, "projects/README.md"), `| Project path | File |\n|---|---|\n| \`${dir}\` | \`app.md\` |\n`);
  const k = await makeEngine({ knowledge: brainKnowledge(root) });
  const task = await k.engine.submit({ command: "fix", goal: "a is 2", folder: dir, options: { check: "grep -q 2 a.txt" } });
  const waiting = k.engine.wait(task);
  const active = (role: string) => [...k.engine.active.values()].find((a) => a.step.role === role && a.run.terminal);
  await until(() => !!active("implement"));
  await k.engine.report(active("implement")!.run.id, "done", "forgot"); // no change: a quality failure
  await until(() => active("implement")?.run.id === "w1.1-r2");
  writeFileSync(join(task.steps[0].worktree!, "a.txt"), "2\n");
  await k.engine.report("w1.1-r2", "done", "set 2");
  await until(() => !!active("curate"));
  const prompt = k.host.spawned.at(-1)!.argv.at(-1)!;
  expect(prompt).toContain("### w1.1: a is 2 (done)");
  expect(prompt).toContain("Failed attempts:\n- w1.1-r1 (oc·m1) fail: No file was changed.");
  await k.engine.report(active("curate")!.run.id, "done", "project: grep -q exits 1 when nothing matches, which fails the check");
  const r = await waiting;
  expect(r.task.status).toBe("done");
  expect(r.text).toMatch(/Knowledge: recorded 1 fact\(s\)\.\n- projects\/app\.md: grep -q exits 1/);
  expect(readFileSync(join(root, "projects/app.md"), "utf8")).toContain(`${FACTS_HEADING}\n\n- grep -q exits 1 when nothing matches, which fails the check (verified `);

  const t2 = await k.engine.submit({ command: "fix", goal: "a is 3", folder: dir, options: { check: "grep -q 3 a.txt" } });
  const w2 = k.engine.wait(t2);
  await until(() => !!active("implement"));
  writeFileSync(join(t2.steps[0].worktree!, "a.txt"), "3\n");
  await k.engine.report(active("implement")!.run.id, "done", "set 3");
  await until(() => !!active("curate"));
  await k.engine.report(active("curate")!.run.id, "stuck", "cannot tell");
  const r2 = await w2;
  expect(r2.task.status).toBe("done"); // the work landed; the curator's trouble is not the task's
  expect(r2.task.steps.map((s) => s.status)).toEqual(["done", "failed"]);
});
