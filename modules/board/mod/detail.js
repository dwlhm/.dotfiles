// Task detail dialog: move its phase, run its agent, answer, approve or land it, read its brief, commits,
// sub-tasks and log.
import { div } from "gpui-kit";
import { h_flex, v_flex, Scrollbar, TextareaState, TextView } from "gpui-base";
import { closeOverlay, props, theme, watchFolder } from "herdr";
import { board, focusTask, liveByTask, loadTasks, openCompose, STATE } from "./data.js";
import { commitList, showCommit } from "./changes.js";
import { answerBox, reportPanel } from "./report.js";
import { agentMark, button, chip, iconButton, liveMark, PHASE, R, TEXT, tone } from "./ui.js";

/** Phases where the task's work is over: its agent has ended and it can be followed up. */
const ENDED = ["done", "failed"];
const when = (ms) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default class Detail {
  init(p, cx) {
    this.id = p.id;
    this.programs = p.programs ?? {};
    this.tasks = [];
    this.error = "";
    this.confirmDelete = false;
    this.busy = false;
    this.commit = { shown: null, stat: "" };
    this.answer = TextareaState.new({ placeholder: "Write your answer…", rows: 3 });
    this.answer.on("submit", (_e, cx) => this.reply(this.answer.value(), cx));
    this.reload(cx);
    cx.spawn(async (cx) => { for (;;) { await watchFolder(STATE).catch(() => null); this.reload(cx); } });
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      try { this.tasks = await loadTasks(); } catch (e) { this.error = e.message; }
      cx.notify();
    });
  }

  act(args, cx, after) {
    if (this.busy) return;
    this.error = "";
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const out = await board(args);
        after?.(out, cx);
      } catch (e) { this.error = e.message; }
      this.busy = false;
      this.reload(cx);
    });
  }

  /** Answers the open task: a picked option or the written text. */
  reply(text, cx) {
    if (!text.trim()) return;
    this.act(["answer", this.id, text.trim()], cx, () => this.answer.set_value(""));
  }

  go(id, cx) {
    this.id = id;
    this.confirmDelete = false;
    this.commit = { shown: null, stat: "" };
    this.answer.set_value("");
    cx.notify();
  }

  section(title, el) {
    const t = theme();
    return v_flex().gap(8).child(div().text_size(TEXT.micro).font_semibold().text_color(t.dim).child(title.toUpperCase())).child(el);
  }

  phases(task, t) {
    // Segmented control: inner radius = outer (7) - padding (2).
    return h_flex().p(2).gap(2).rounded(R.control).bg(t.raised).flex_wrap().children(Object.keys(PHASE).map((p) => {
      const on = task.phase === p;
      return h_flex().id(`ph-${p}`).h(26).px(9).gap(5).items_center().rounded(R.control - 2).text_size(TEXT.meta)
        .text_color(on ? t.foreground : t.muted).when(on, (el) => el.bg(t.background).shadow_xs())
        .when(!on, (el) => el.hover((s) => s.text_color(t.foreground)))
        .on_click((_e, cx) => !on && this.act(["phase", task.id, p], cx))
        .child(div().size(6).rounded(3).bg(tone(t, p))).child(PHASE[p].label);
    }));
  }

  agentRow(task, live, t) {
    const a = task.assignee;
    const assign = (name) => button(`as-${name}`, name, (cx) => this.act(["assign", task.id, name], cx));
    // Its worktree went when it ended: nothing to resume into; a follow-up continues it.
    const gone = Boolean(task.worktree) && ENDED.includes(task.phase);
    if (!a) {
      return h_flex().gap(6).items_center().child(div().text_size(TEXT.body).text_color(t.muted).mr(4).child("Start an agent:")).children(Object.keys(this.programs).map(assign));
    }
    return h_flex().gap(10).items_center()
      .child(agentMark(a.agent, live?.program ?? this.programs[a.agent], 18))
      .child(v_flex().flex_1().min_w(0)
        .child(h_flex().gap(6).items_center().text_size(TEXT.body).text_color(t.foreground).child(a.agent).child(liveMark(live, t)))
        .child(div().text_size(TEXT.meta).text_color(t.dim).truncate()
          .child(live ? (live.msg || `running in ${live.address}`) : gone ? "ended · its worktree is gone, follow it up to continue" : "not running · resumes with its context")))
      .when(!gone, (el) => el.child(button("open", live ? "Show" : "Resume", (cx) => this.act(["open", task.id], cx, (address, cx) => { closeOverlay(props().overlay); focusTask(task.id, address, cx); }), { kind: "solid", icon: "terminal" })))
      .when(Boolean(live), (el) => el.child(button("stop", "Stop", (cx) => this.act(["stop", task.id], cx))));
  }

  subs(task, live, t) {
    const subs = this.tasks.filter((s) => s.parent === task.id);
    if (!subs.length) return null;
    return v_flex().gap(2).children(subs.map((s) => h_flex().id(`d-sub-${s.id}`).h(28).px(8).gap(8).items_center().rounded(R.chip)
      .text_size(TEXT.body).hover((st) => st.bg(t.hover)).on_click((_e, cx) => this.go(s.id, cx))
      .child(div().size(7).flex_none().rounded(4).bg(tone(t, s.phase)))
      .child(div().flex_none().text_color(t.dim).child(s.id))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(s.title))
      .child(liveMark(live[s.id], t))
      .child(div().flex_none().text_size(TEXT.meta).text_color(t.muted).child(`${s.assignee?.agent ?? "unassigned"} · ${PHASE[s.phase].label}`))));
  }

  log(task, t) {
    return v_flex().gap(6).children(task.log.slice(-40).reverse().map((e, i) => h_flex().id(`log-${i}`).gap(10).text_size(TEXT.meta)
      .child(div().w(88).flex_none().text_color(t.dim).child(when(e.at)))
      .child(div().w(44).flex_none().text_color(t.muted).child(e.by))
      .child(div().flex_1().min_w(0).text_color(t.foreground).child(e.text))));
  }

  render() {
    const t = theme();
    const task = this.tasks.find((x) => x.id === this.id);
    const shell = v_flex().size_full().bg(t.popover).text_color(t.foreground);
    if (!task) return shell.p(20).child(div().text_color(t.muted).child(this.error || "Loading…"));
    const live = liveByTask();
    const parent = task.parent && this.tasks.find((x) => x.id === task.parent);
    const source = task.forked_from && this.tasks.find((x) => x.id === task.forked_from);
    const subs = this.subs(task, live, t);
    const ctx = { t, answer: this.answer, busy: this.busy, onAnswer: (text, cx) => this.reply(text, cx), onLand: (cx) => this.act(["land", task.id], cx), onApprove: (cx) => this.act(["approve", task.id], cx) };
    const unlanded = Boolean(task.worktree) && !ENDED.includes(task.phase);
    return shell
      .child(v_flex().px(20).pt(18).pb(14).gap(10).border_b(1).border_color(t.border)
        .child(h_flex().gap(8).items_center().text_size(TEXT.meta)
          .when(Boolean(parent), (el) => el.child(div().id("up").text_color(t.accent).hover((s) => s.opacity(0.8)).on_click((_e, cx) => this.go(parent.id, cx)).child(`${parent.id} ›`)))
          .child(div().text_color(t.dim).font_medium().child(task.id))
          .when(Boolean(source), (el) => el.child(div().id("source").text_color(t.accent).hover((s) => s.opacity(0.8)).on_click((_e, cx) => this.go(source.id, cx)).child(`↳ ${source.id}`)))
          .child(chip(PHASE[task.phase].label, tone(t, task.phase)))
          .child(div().flex_1())
          .child(iconButton("close", "x", "Close", () => closeOverlay(props().overlay))))
        .child(div().text_size(17).font_semibold().child(task.title))
        .when(Boolean(task.note) && !task.report, (el) => el.child(div().text_size(TEXT.body).text_color(t.muted).child(task.note)))
        .child(this.phases(task, t)))
      .child(div().relative().flex_1().min_h(0)
        .child(v_flex().id("detail-body").size_full().overflow_y_scroll().px(20).py(16).gap(20)
          .when(Boolean(task.report), (el) => el.child(reportPanel(task, ctx)))
          .when(task.phase === "waiting" && !task.report, (el) => el.child(this.section("Answer", answerBox(task, ctx))))
          .child(this.section("Agent", this.agentRow(task, live[task.id], t)))
          .when(task.inbox.length > 0, (el) => el.child(this.section(`Waiting for its agent (${task.inbox.length})`, v_flex().gap(4)
            .children(task.inbox.map((m, i) => div().id(`in-${i}`).text_size(TEXT.body).child(`${m.from} ${m.status}: ${m.text}`))))))
          .when(Boolean(task.brief), (el) => el.child(this.section("Brief", TextView.markdown(`brief-${task.id}`, task.brief).selectable(true).text_size(TEXT.body))))
          .when(task.commits.length > 0, (el) => el.child(this.section(ENDED.includes(task.phase) ? "Commits" : "Commits to land",
            commitList(task, this.commit, t, (sha, cx) => showCommit(task, sha, this.commit, cx)))))
          .when(Boolean(subs), (el) => el.child(this.section("Sub-tasks", subs)))
          .child(this.section("Activity", this.log(task, t)))
          .child(h_flex().gap(8).items_center().pt(4)
            .child(div().flex_1().text_size(TEXT.meta).text_color(t.blocked).child(this.error))
            .when(ENDED.includes(task.phase), (el) => el.child(button("fork", "Follow up", () => { closeOverlay(props().overlay); openCompose(this.programs, task); }, { icon: "plus" })))
            .child(button("del", this.confirmDelete ? (unlanded ? "Delete, dropping work not landed?" : "Delete with its sub-tasks?") : "Delete", (cx) => {
              if (!this.confirmDelete) { this.confirmDelete = true; return cx.notify(); }
              this.act(["rm", task.id, "--force"], cx, () => closeOverlay(props().overlay));
            }, { kind: "danger" }))))
        .child(Scrollbar.vertical("detail-body").absolute().inset_0()));
  }
}
