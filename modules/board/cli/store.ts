// The task store: one JSON file per task under `<state>/tasks/`. Every writer (agents, the board
// mod, the user) goes through this file, so ids, locking and the record shape live in one place.
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseReport, type Report } from "./report";

export const PHASES = ["backlog", "plan", "work", "review", "test", "waiting", "done", "failed"] as const;
export type Phase = (typeof PHASES)[number];
/** Phases an agent sets on its own card; the others follow from reports. */
export const WORK_PHASES = ["plan", "work", "review", "test"] as const;

export interface Assignee {
  agent: string;
  /** Live hc terminal, or null once it ended. */
  terminal: string | null;
  /** The agent's own session id, so `open` resumes it with its context. */
  session: string | null;
}

export interface Message { from: string; status: string; text: string; at: number }
export interface Entry { at: number; by: string; text: string }

export interface Task {
  id: string;
  parent: string | null;
  title: string;
  brief: string;
  cwd: string;
  phase: Phase;
  /** Short note from the last phase change. */
  note: string;
  /** "user" or the id of the task whose agent made this one: hand-backs go there. */
  creator: string;
  /** Who a waiting task waits for: "user" or a task id. */
  waiting_on: string | null;
  /** The agent's last report while it stands: cleared by an answer or a phase change. */
  report: Report | null;
  assignee: Assignee | null;
  /** Hand-backs that arrived while this task's agent was not running. */
  inbox: Message[];
  log: Entry[];
  created: number;
  updated: number;
}

const ID = /^T\d+(\.\d+)*$/;
export const isId = (s: string) => ID.test(s);
const file = (id: string) => `${id}.json`;

export class Store {
  constructor(readonly dir: string) {}

  private path(id: string) {
    if (!isId(id)) throw new Error(`not a task id: ${id}`);
    return join(this.dir, file(id));
  }

  async list(): Promise<Task[]> {
    await mkdir(this.dir, { recursive: true });
    const names = (await readdir(this.dir)).filter((n) => n.endsWith(".json") && isId(n.slice(0, -5)));
    const tasks = await Promise.all(names.map((n) => this.get(n.slice(0, -5)).catch(() => null)));
    return tasks.filter((t): t is Task => t !== null).sort((a, b) => order(a.id, b.id));
  }

  async get(id: string): Promise<Task> {
    try {
      return upgrade(JSON.parse(await readFile(this.path(id), "utf8")));
    } catch (e: any) {
      if (e?.code === "ENOENT") throw new Error(`no task ${id}`);
      throw e;
    }
  }

  /** Allocates the next id (T<n>, or <parent>.<n>) by exclusive create, so concurrent writers
   *  never share one. */
  async create(fields: Omit<Task, "id" | "created" | "updated">, now: number): Promise<Task> {
    await mkdir(this.dir, { recursive: true });
    for (;;) {
      const id = await this.nextId(fields.parent);
      const task: Task = { ...fields, id, created: now, updated: now };
      try {
        await writeFile(this.path(id), JSON.stringify(task, null, 2), { flag: "wx" });
        return task;
      } catch (e: any) {
        if (e?.code !== "EEXIST") throw e;
      }
    }
  }

  private async nextId(parent: string | null): Promise<string> {
    const prefix = parent ? `${parent}.` : "T";
    const taken = (await readdir(this.dir))
      .map((n) => n.replace(/\.json$/, ""))
      .filter((n) => n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length)))
      .map((n) => Number(n.slice(prefix.length)));
    return `${prefix}${Math.max(0, ...taken) + 1}`;
  }

  /** Read-modify-write under a per-task lock; `change` returns the new task. */
  async update(id: string, now: number, change: (t: Task) => Task): Promise<Task> {
    return this.locked(id, async () => {
      const next = { ...change(await this.get(id)), updated: now };
      const tmp = `${this.path(id)}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2));
      await rename(tmp, this.path(id));
      return next;
    });
  }

  async remove(id: string): Promise<void> {
    await rm(this.path(id), { force: true });
  }

  private async locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const lock = `${this.path(id)}.lock`;
    for (let i = 0; ; i++) {
      try {
        await mkdir(lock);
        break;
      } catch (e: any) {
        if (e?.code !== "EEXIST") throw e;
        if (i > 200) throw new Error(`task ${id} is locked (${lock}); remove it if no board command is running`);
        await Bun.sleep(10);
      }
    }
    try {
      return await fn();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
}

const LEGACY = { waiting: "question", done: "done", failed: "failed" } as const;

/** A task saved before reports had a shape: its closing note becomes the report. */
function upgrade(t: Task): Task {
  if (t.report !== undefined) return t;
  const status = LEGACY[t.phase as keyof typeof LEGACY];
  return { ...t, report: status && t.note.trim() ? parseReport(status, t.note, t.updated) : null };
}

/** T2 < T2.1 < T2.10 < T10: numeric per segment. */
export function order(a: string, b: string): number {
  const x = a.slice(1).split(".").map(Number), y = b.slice(1).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

export const children = (tasks: Task[], id: string) => tasks.filter((t) => t.parent === id);
export const descendants = (tasks: Task[], id: string) => tasks.filter((t) => t.id.startsWith(`${id}.`));
