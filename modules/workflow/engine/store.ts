// Task records in the brain repo. The engine is the only writer: every save is validated against
// the spec and written atomically; git commits happen at milestones and touch only that record.
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { commitSnapshot } from "./gitsnap";
import { brainLayout } from "./brain";
import { readDoc, renderDoc } from "./frontmatter";
import { checkTask, type Task } from "./records";
import { parseId } from "./ids";
import type { Spec } from "./spec";

const CLOSED = new Set(["done", "failed", "stopped"]);

export class Store {
  private next = 0;
  private bodies = new Map<string, string>();
  private rendered = new Map<string, string>();
  private commits: Promise<void> = Promise.resolve();

  constructor(
    readonly root: string,
    readonly spec: Spec,
  ) {}

  private files(): string[] {
    const dir = join(this.root, "tasks");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
      .flatMap((m) => readdirSync(join(dir, m)).filter((f) => /^w\d+\.md$/.test(f)).map((f) => join(dir, m, f)));
  }

  /** The next task id: one above every record ever written. */
  nextId(): string {
    if (!this.next) {
      const nums = this.files().map((f) => parseId(f.split("/").pop()!.slice(0, -3))?.task ?? 0);
      this.next = Math.max(0, ...nums) + 1;
    }
    return `w${this.next++}`;
  }

  path(task: Task): string {
    return brainLayout(this.root).taskRecord(task.id, task.created);
  }

  save(task: Task, body?: string): void {
    if (body !== undefined) this.bodies.set(task.id, body);
    const file = this.path(task);
    const errors = checkTask(file, task as unknown as Record<string, unknown>, this.spec);
    if (errors.length) throw new Error(`refusing to write an invalid record:\n${errors.join("\n")}`);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    const content = renderDoc(task as unknown as Record<string, unknown>, this.bodies.get(task.id) ?? `# ${task.goal}`);
    this.rendered.set(task.id, content);
    writeFileSync(tmp, content);
    renameSync(tmp, file);
  }

  /**
   * Commit this record only (never anything else staged in the brain), as it is right now: the
   * content and the label are taken together, so a commit that runs late still says what it holds.
   * Serialized; never throws.
   */
  commit(task: Task): Promise<void> {
    const file = this.path(task);
    const content = this.rendered.get(task.id);
    const label = `docs(brain): wf ${task.id} ${task.status === "running" ? "started" : task.status}`;
    const run = async () => {
      if (content === undefined || !existsSync(join(this.root, ".git"))) return;
      try {
        await commitSnapshot(this.root, relative(this.root, file), content, label);
      } catch (e) {
        console.error(`wf: brain commit of ${task.id} failed: ${(e as Error).message}`);
      }
    };
    this.commits = this.commits.then(run, run);
    return this.commits;
  }

  /** Resolves once every queued commit has run. */
  flushed(): Promise<void> {
    return this.commits;
  }

  /** Records that are not closed: what a (re)started engine must pick up. */
  open(): Task[] {
    const out: Task[] = [];
    for (const f of this.files()) {
      const doc = readDoc(f);
      const task = doc.data as unknown as Task;
      if (CLOSED.has(task.status)) continue;
      this.bodies.set(task.id, doc.body);
      out.push(task);
    }
    return out;
  }

  body(id: string): string {
    return this.bodies.get(id) ?? "";
  }
}

