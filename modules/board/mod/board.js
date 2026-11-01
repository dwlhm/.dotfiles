// The kanban: root tasks in phase columns, live from the store folder and Herdr's terminals.
import { div } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { notify, openOverlay, playSound, theme, watchFolder } from "herdr";
import { agentPrograms, board, focusTask, liveByTask, loadTasks, nameTabs, openCompose, STATE } from "./data.js";
import { card } from "./card.js";
import { button, columnOf, COLUMNS, folderLabels, GAP, icon, PHASE, R, segment, TEXT, tilde, tone } from "./ui.js";

const COLUMN_W = 272;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default class Board {
  init(_p, cx) {
    this.tasks = null; // null until the first load
    this.error = "";
    this.programs = {};
    this.seen = null; // root id → phase, to tell the person when one needs them or finished
    this.folder = null; // cwd the board shows only, null = every folder
    cx.spawn(async (cx) => {
      this.programs = await agentPrograms().catch((e) => { this.error = e.message; return {}; });
      cx.notify();
    });
    this.reload(cx);
    cx.spawn(async (cx) => { for (;;) { await watchFolder(STATE).catch(() => null); this.reload(cx); } });
    // Fresh tabs show a moment after their terminal starts; name them once they do.
    cx.timer.every(3000, () => this.tasks && nameTabs(this.tasks));
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      try {
        this.tasks = await loadTasks();
        // A filter on a folder that has no tasks left would hide everything.
        if (!this.tasks.some((x) => !x.parent && x.cwd === this.folder)) this.folder = null;
        this.error = "";
        this.announce();
        nameTabs(this.tasks);
      } catch (e) { this.error = e.message; }
      cx.notify();
    });
  }

  announce() {
    const now = Object.fromEntries(this.tasks.filter((t) => !t.parent).map((t) => [t.id, t.phase]));
    if (this.seen) {
      for (const task of this.tasks) {
        const was = this.seen[task.id];
        if (task.parent || !was || was === task.phase) continue;
        const needsYou = task.phase === "waiting" && task.waiting_on === "user";
        if (!needsYou && task.phase !== "done" && task.phase !== "failed") continue;
        playSound(needsYou ? "blocked" : "done");
        notify({ title: `${task.id} ${needsYou ? "needs you" : PHASE[task.phase].label.toLowerCase()}`, body: task.note || task.title,
          level: needsYou || task.phase === "failed" ? "warning" : "success" });
      }
    }
    this.seen = now;
  }

  select(id) {
    openOverlay({ mod: "board", props: { role: "detail", id, programs: this.programs }, kind: "dialog", width: 640, height: 0.82 });
  }

  compose() {
    openCompose(this.programs);
  }

  open(id, cx) {
    cx.spawn(async (cx) => {
      try { focusTask(id, await board(["open", id]), cx); } catch (e) { this.error = e.message; cx.notify(); }
    });
  }

  column(phase, roots, ctx) {
    const t = ctx.t;
    const cards = roots.filter((r) => columnOf(r.phase) === phase);
    return v_flex().w(COLUMN_W).flex_none().h_full().p(GAP.column).gap(GAP.column).rounded(R.column).bg(t.surface)
      .child(h_flex().h(28).px(6).gap(8).items_center()
        .child(div().size(8).rounded(4).bg(tone(t, phase)))
        .child(div().text_size(TEXT.body).font_semibold().text_color(t.foreground).child(PHASE[phase].label))
        .child(div().text_size(TEXT.meta).text_color(t.dim).child(String(cards.length))))
      .child(div().relative().flex_1().min_h(0)
        .child(v_flex().id(`col-${phase}`).size_full().overflow_y_scroll().gap(GAP.column)
          .children(cards.map((task) => card(task, { ...ctx, subs: (this.tasks ?? []).filter((s) => s.parent === task.id) })))
          .when(cards.length === 0, (el) => el.child(div().h(64).rounded(R.card).border(1).border_dashed().border_color(t.border)
            .flex().items_center().justify_center().text_size(TEXT.meta).text_color(t.dim).child("Nothing here"))))
        .child(Scrollbar.vertical(`col-${phase}`).absolute().inset_0()));
  }

  /** Folders of the root tasks, most tasks first: [{ cwd, label, count }]. */
  folders(roots) {
    const counts = {};
    for (const r of roots) counts[r.cwd] = (counts[r.cwd] ?? 0) + 1;
    const labels = folderLabels(Object.keys(counts));
    return Object.entries(counts).map(([cwd, count]) => ({ cwd, label: labels[cwd], count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  /** Segmented "All · dotfiles 3 · rove 1"; shown once tasks span two folders. */
  filterBar(folders, total, t) {
    const pick = (cwd) => (cx) => { this.folder = cwd; cx.notify(); };
    const count = (n) => div().text_color(t.dim).child(String(n));
    return h_flex().flex_none().px(16).pb(10)
      .child(h_flex().id("folders").min_w(0).overflow_x_scroll().p(2).gap(2).rounded(R.control).bg(t.raised)
        .child(segment("folder-all", this.folder === null, pick(null), t).child("All").child(count(total)))
        .children(folders.map((f, i) => segment(`folder-${i}`, this.folder === f.cwd, pick(f.cwd), t).tooltip(tilde(f.cwd))
          .child(icon("folder", 11)).child(f.label).child(count(f.count)))));
  }

  render() {
    const t = theme();
    const live = liveByTask();
    const tasks = this.tasks ?? [];
    const all = tasks.filter((x) => !x.parent);
    const folders = this.folders(all);
    const roots = this.folder === null ? all : all.filter((x) => x.cwd === this.folder);
    const running = Object.keys(live).length;
    const needsYou = tasks.filter((x) => (x.phase === "waiting" && x.waiting_on === "user") || live[x.id]?.status === "blocked").length;
    const ctx = { t, live, programs: this.programs, folders: Object.fromEntries(folders.map((f) => [f.cwd, f.label])), onSelect: (id) => this.select(id), onOpen: (id, cx) => this.open(id, cx) };
    return v_flex().size_full().bg(t.canvas).text_color(t.foreground)
      .child(h_flex().h(52).px(16).gap(12).items_center().flex_none()
        .child(div().text_size(15).font_semibold().child("Board"))
        .child(div().text_size(TEXT.meta).text_color(t.muted).child(this.tasks ? `${plural(roots.length, "task")} · ${plural(running, "agent")} running` : "Loading…"))
        .when(needsYou > 0, (el) => el.child(div().text_size(TEXT.meta).font_semibold().text_color(t.blocked).child(`${needsYou} need you`)))
        .child(div().flex_1())
        .when(Boolean(this.error), (el) => el.child(div().max_w(360).truncate().text_size(TEXT.meta).text_color(t.blocked).child(this.error)))
        .child(button("new", "New task", () => this.compose(), { kind: "solid", icon: "plus" })))
      .when(folders.length > 1, (el) => el.child(this.filterBar(folders, all.length, t)))
      .child(div().relative().flex_1().min_h(0)
        .child(h_flex().id("columns").size_full().overflow_x_scroll().px(12).pb(12).gap(10).items_start()
          .children(COLUMNS.map((p) => this.column(p, roots, ctx))))
        .child(Scrollbar.horizontal("columns").absolute().inset_0()));
  }
}
