import { test, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSpec } from "./spec";
import { specDir } from "./cli";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wf-spec-"));
  cpSync(specDir(), dir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const edit = (file: string, from: string | RegExp, to: string) => {
  const p = join(dir, file);
  const s = readFileSync(p, "utf8");
  const next = s.replace(from, to);
  if (next === s) throw new Error(`test setup: ${from} not found in ${file}`);
  writeFileSync(p, next);
};
const errorsOf = (): string => {
  try {
    loadSpec(dir);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

test("the shipped spec is valid", () => {
  const spec = loadSpec(specDir());
  expect([...spec.commands.keys()]).toEqual(["fix", "build", "review", "ask", "compare"]);
  expect(spec.roles.get("implement")?.can).toContain("edit");
  expect(spec.policy.integration_branch).toBe("wf/integration");
  expect(spec.options.get("check")?.takes).toBe("command");
});

test("an unknown capability names the file, the field and the known ones", () => {
  edit("roles/review.md", "can: [read,", "can: [read, shel-check,");
  expect(errorsOf()).toMatch(/roles\/review\.md: can: unknown 'shel-check' \(known: read, edit/);
});

test("a role cannot report an engine outcome or skip shell-report", () => {
  edit("roles/qa.md", "reports: [done, stuck, question]", "reports: [done, fail]");
  edit("roles/qa.md", ", shell-report]", "]");
  const msg = errorsOf();
  expect(msg).toMatch(/qa\.md: reports: 'fail' is reported by the engine/);
  expect(msg).toMatch(/qa\.md: can: every role needs shell-report/);
});

test("a prompt variable must be declared in needs", () => {
  edit("roles/research.md", "Look at: {{about}}", "Look at: {{abuot}}");
  expect(errorsOf()).toMatch(/research\.md: body: \{\{abuot\}\} is not in needs \(question, about\)/);
});

test("broken frontmatter is reported, not thrown away", () => {
  writeFileSync(join(dir, "roles/plan.md"), "no frontmatter here\n");
  edit("roles/curate.md", "tier: small", "tier: [small");
  const msg = errorsOf();
  expect(msg).toMatch(/plan\.md: missing frontmatter/);
  expect(msg).toMatch(/curate\.md: invalid YAML frontmatter/);
});

test("commands must point at real roles, results and options", () => {
  edit("commands.md", "roles: [review]", "roles: [reviewer]");
  edit("commands.md", "result: answer", "result: essay");
  edit("commands.md", "options: [in, with, report-to]", "options: [in, wiht, report-to]");
  edit("commands.md", "example: review PR #42", "example: look at PR #42");
  const msg = errorsOf();
  expect(msg).toMatch(/commands\.review: roles: unknown 'reviewer'/);
  expect(msg).toMatch(/commands\.ask: result: unknown 'essay'/);
  expect(msg).toMatch(/commands\.review: options: unknown 'wiht'/);
  expect(msg).toMatch(/commands\.review: example: must start with 'review '/);
});

test("policy rules use the vocab and the integration branch is never main", () => {
  edit("policy.md", "when: touches_ui", "when: looks_nice");
  edit("policy.md", "then: [add_qa_step]", "then: [add_qa_step, deploy]");
  edit("policy.md", "integration_branch: wf/integration", "integration_branch: main");
  edit("policy.md", "plan_depth: 2", "plan_depth: two");
  const msg = errorsOf();
  expect(msg).toMatch(/rules\[1\]: when: unknown 'looks_nice'/);
  expect(msg).toMatch(/rules\[1\]: then: unknown 'deploy'/);
  expect(msg).toMatch(/integration_branch: 'main' is not a safe branch name/);
  expect(msg).toMatch(/limits\.plan_depth|plan_depth: must be a whole number/);
});

test("a vocab without outcomes' owner fails before anything else is trusted", () => {
  edit("vocab.md", /  done:\n    by: agent/, "  done:\n    by: someone");
  expect(errorsOf()).toMatch(/vocab\.md: outcomes\.done\.by: must be agent or engine/);
});
