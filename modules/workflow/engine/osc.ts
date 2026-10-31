// The engine's own status as OSC 7501 on its stdout: the same channel agents report on, so the
// board sees one wf terminal instead of guessing. One pure aggregate, one pure encoder.
import type { Task } from "./records";
import type { Report } from "./types";

export type { Report };

const NAME = "wf";
const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

/** The user is needed: a blocked task, or a plan that waits for approval. */
const waiting = (t: Task) => t.status === "blocked" || t.status === "awaiting_approval";

/**
 * The most urgent over the open tasks: a task waiting for a person first, else work in flight,
 * else idle. Paused (or planning) tasks are open but neither urgent nor working.
 */
export function aggregate(tasks: Iterable<Task>): Report {
  const open = [...tasks].filter((t) => t.status !== "done" && t.status !== "failed" && t.status !== "stopped");
  const stuck = open.find(waiting);
  if (stuck) return { state: "blocked", kind: "question", msg: `${stuck.id} ${stuck.status === "blocked" ? "is blocked" : "waits for approval"}` };
  const running = open.filter((t) => t.status === "running").length;
  if (running) return { state: "working", msg: `${running} task${running === 1 ? "" : "s"} running` };
  if (!open.length) return { state: "idle", msg: "no open tasks" };
  const paused = open.every((t) => t.status === "paused");
  return { state: "idle", msg: `${open.length} task${open.length === 1 ? "" : "s"} ${paused ? "paused" : "open"}` };
}

/** `ESC ] 7501 ; state=<s>:app=wf:title=<base64 "wf">:msg=<base64 msg>[:kind=<k>] ESC \`. */
export function encode(report: Report): string {
  const kind = report.kind ? `:kind=${report.kind}` : "";
  return `\x1b]7501;state=${report.state}:app=${NAME}:title=${base64(NAME)}:msg=${base64(report.msg)}${kind}\x1b\\`;
}
