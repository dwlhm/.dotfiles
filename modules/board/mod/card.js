// One kanban card: a root task, its live agent and its sub-tasks.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { reportBlock } from "./report.js";
import { agentMark, chip, GAP, iconButton, liveMark, PHASE, progress, R, surface, tag, TEXT, tilde, tone } from "./ui.js";

const MAX_SUBS = 4;

const OPEN = ["plan", "work", "review", "test"];

/** What the card says the task is doing: the agent's live report; an agent that went quiet
 *  without reporting (a quota, a crash, a finished turn); else the last phase note. */
function activity(task, live) {
  if (live?.status === "working" && live.msg) return live.msg;
  if (live && (live.status === "idle" || live.status === "done") && OPEN.includes(task.phase)) return "Agent idle without a report — open it to continue";
  return task.note || "";
}

/** Waiting or failed without a report (moved there by hand): the report block says it otherwise. */
function waitingChip(task, t) {
  if (task.report) return null;
  if (task.phase === "failed") return chip("Failed", t.blocked);
  if (task.phase !== "waiting") return null;
  return chip(task.waiting_on === "user" ? "Waits for you" : `Waits for ${task.waiting_on}`, t.blocked);
}

function subRow(sub, ctx) {
  const { t, live, onSelect } = ctx;
  return h_flex().id(`sub-${sub.id}`).h(24).px(6).gap(6).items_center().rounded(R.chip)
    .text_size(TEXT.meta).hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => onSelect(sub.id, cx))
    .child(div().size(6).flex_none().rounded(3).bg(tone(t, sub.phase)))
    .child(div().flex_none().text_color(t.dim).child(sub.id))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(sub.title))
    .child(liveMark(live[sub.id], t))
    .child(div().flex_none().text_color(t.dim).child(PHASE[sub.phase].label));
}

export function card(task, ctx) {
  const { t, live, programs, folders, subs, onSelect, onOpen } = ctx;
  const l = live[task.id];
  const doing = task.report ? "" : activity(task, l);
  const done = subs.filter((s) => s.phase === "done").length;
  const agent = task.assignee?.agent;
  const shown = subs.slice(0, MAX_SUBS);

  return surface(v_flex().id(`card-${task.id}`).w_full().p(GAP.card).gap(8).rounded(R.card), t)
    .hover((s) => s.border_color(t.input))
    .on_click((_e, cx) => onSelect(task.id, cx))
    .child(h_flex().gap(6).items_center().text_size(TEXT.meta)
      .child(div().text_color(t.dim).font_medium().child(task.id))
      .child(div().flex_1())
      .when(Boolean(waitingChip(task, t)), (el) => el.child(waitingChip(task, t)))
      .when(Boolean(agent), (el) => el.child(liveMark(l, t))))
    .child(div().text_size(TEXT.title).font_semibold().text_color(t.foreground).child(task.title))
    .when(Boolean(doing), (el) => el.child(
      div().text_size(TEXT.meta).text_color(l?.status === "working" ? t.muted : t.dim).truncate().child(doing)))
    .when(Boolean(task.report), (el) => el.child(reportBlock(task, t)))
    .when(subs.length > 0, (el) => el.child(v_flex().gap(1).pt(2).children(shown.map((s) => subRow(s, ctx))))
      .when(subs.length > MAX_SUBS, (el) => el.child(div().px(6).text_size(TEXT.micro).text_color(t.dim).child(`+${subs.length - MAX_SUBS} more`))))
    .child(h_flex().gap(8).items_center().pt(2)
      .child(agent
        ? h_flex().gap(6).items_center().text_size(TEXT.meta).text_color(t.muted)
          .child(agentMark(agent, l?.program ?? programs[agent], 14)).child(agent)
        : div().text_size(TEXT.meta).text_color(t.dim).child("Unassigned"))
      .child(tag(folders[task.cwd], t, { icon: "folder", tip: tilde(task.cwd) }))
      .child(div().flex_1())
      .when(subs.length > 0, (el) => el.child(progress(`p-${task.id}`, done, subs.length, t)))
      .when(Boolean(agent), (el) => el.child(iconButton(`open-${task.id}`, "terminal", l ? "Show agent" : "Resume agent", (cx) => onOpen(task.id, cx)))));
}
