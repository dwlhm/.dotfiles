// wf board: open wf tasks, their progress and the runs in flight. Read-only view of
// `wf status --json`; its buttons call wf, and a run's row peeks at its terminal.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, hc, home, run, theme, watchFolder } from "herdr";

const TONE = { blocked: "blocked", awaiting_approval: "blocked", running: "working", paused: "idle" };
const LABEL = { awaiting_approval: "waits for you", blocked: "needs you", running: "running", paused: "paused" };

export default class WfBoard extends View {
  init(_props, cx) {
    this.tasks = [];
    this.error = null;
    this.refresh(cx);
    // Records change on every task step; runs can change without a record write, so a slow
    // data timer covers the rest.
    cx.spawn(async (cx) => {
      // No records folder yet (or not watchable): the data timer alone keeps the board fresh.
      for (;;) {
        if (!(await watchFolder(`${home()}/brain/tasks`).then(() => true, () => false))) return;
        this.refresh(cx);
      }
    });
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      const r = await exec("wf", ["status", "--json"]).catch((e) => ({ code: 127, stdout: "", stderr: String(e) }));
      try {
        this.tasks = r.code === 0 ? JSON.parse(r.stdout).tasks : this.tasks;
        this.error = r.code === 0 ? null : (r.stderr.trim() || `wf status exited ${r.code}`);
      } catch {
        this.error = "wf status gave no readable data";
      }
      cx.notify();
    });
  }

  // `wf approve` waits for the work to finish, longer than exec may run: it runs on as its own
  // short-lived hc terminal instead, removed when done.
  act(args, cx) {
    cx.spawn(async (cx) => {
      if (args[0] === "approve") await hc(["run", "--bg", "--no-parent", "--rm", "--", "wf", ...args]);
      else await exec("wf", args);
      this.refresh(cx);
    });
  }

  button(id, text, args, t) {
    return div().id(id).px(8).py(2).rounded(4).border(1).border_color(t.border).text_size(11.5)
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => this.act(args, cx))
      .child(text);
  }

  runRow(r, t) {
    const open = () => r.terminal && run("terminal.peek", { terminal: r.terminal });
    return h_flex().id(`run-${r.id}`).gap(6).pl(14).py(2).text_size(11.5).text_color(t.muted)
      .hover((s) => s.bg(t.hover)).on_click(open)
      .child(div().child(r.id))
      .child(div().flex_1().truncate().child(`${r.runner}·${r.model}`))
      .child(div().text_color(t.dim).child(r.taken ? "taken" : (r.terminal ?? "starting")));
  }

  card(task, t) {
    const tone = t[TONE[task.status] ?? "idle"];
    const buttons = h_flex().gap(6)
      .when(task.status === "awaiting_approval", (el) => el.child(this.button(`approve-${task.id}`, "Approve", ["approve", task.id], t)))
      .when(task.status === "running", (el) => el.child(this.button(`pause-${task.id}`, "Pause", ["pause", task.id], t)))
      .when(task.status === "paused", (el) => el.child(this.button(`resume-${task.id}`, "Resume", ["resume", task.id], t)))
      .child(this.button(`stop-${task.id}`, "Stop", ["stop", task.id], t));
    return v_flex().id(`task-${task.id}`).gap(4).p(10).rounded(6).bg(t.surface).border_l(3).border_color(tone)
      .child(h_flex().gap(6).items_center().text_size(12)
        .child(div().font_semibold().child(`${task.id} ${task.command}`))
        .child(div().text_color(tone).child(LABEL[task.status] ?? task.status))
        .child(div().flex_1())
        .child(div().text_color(t.dim).child(`${task.done}/${task.total}`)))
      .child(div().text_size(12).text_color(t.foreground).child(task.goal))
      .children(task.runs.map((r) => this.runRow(r, t)))
      .child(buttons);
  }

  render() {
    const t = theme();
    const body = this.error
      ? div().text_color(t.blocked).child(this.error)
      : this.tasks.length ? v_flex().gap(8).children(this.tasks.map((task) => this.card(task, t)))
      : div().text_color(t.dim).child("No open wf tasks.");
    return v_flex().size_full().p(10).gap(10).bg(t.chrome).text_color(t.foreground).overflow_y_scrollbar()
      .child(div().text_size(12).font_semibold().text_color(t.muted).child("wf"))
      .child(body);
  }
}
