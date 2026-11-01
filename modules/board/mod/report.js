// An agent's report (`task.report`, shaped by the CLI): the block a card shows and the panel the
// task dialog opens with, where a question is answered with one of its options or in own words.
import { div } from "gpui-kit";
import { h_flex, v_flex, Textarea, TextView } from "gpui-base";
import { button, chip, icon, R, TEXT } from "./ui.js";

const KIND = {
  question: { label: (who) => `Question for ${who}`, icon: "square-pen", tone: "blocked" },
  stuck: { label: (who) => `Stuck · needs ${who}`, icon: "clock", tone: "blocked" },
  done: { label: () => "Done", icon: "circle-check", tone: "done" },
  failed: { label: () => "Failed", icon: "x", tone: "blocked" },
};
/** Done in a worktree, its commits waiting for the person (`board land`). */
const LAND = { label: () => "Done · land it", icon: "circle-check", tone: "blocked" };

export const landing = (task) => task.phase === "waiting" && task.report?.status === "done" && Boolean(task.worktree);

const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
};

const kindOf = (task, t) => {
  const k = landing(task) ? LAND : KIND[task.report.status];
  return { ...k, color: t[k.tone] ?? t.dim, label: k.label(task.waiting_on === "user" || !task.waiting_on ? "you" : task.waiting_on) };
};

/** A question the person (or the creator's agent) still has to answer. */
export const asking = (task) => task.phase === "waiting" && Boolean(task.report);

function mark(k) {
  return h_flex().gap(5).items_center().text_size(TEXT.micro).font_semibold().text_color(k.color)
    .child(icon(k.icon, 11)).child(k.label);
}

/** On a card: what the agent said, its headline wrapping up to `lines` lines. */
export function reportBlock(task, t) {
  const k = kindOf(task, t);
  const asks = asking(task);
  const lines = asks ? 4 : 2;
  const n = task.report.options.length;
  return v_flex().gap(4).px(8).py(7).rounded(R.chip).bg(k.color + (asks ? "17" : "0d"))
    .child(h_flex().items_center().gap(6)
      .child(mark(k)).child(div().flex_1())
      .when(asks && n > 0, (el) => el.child(div().text_size(TEXT.micro).text_color(t.muted).child(`${n} choice${n > 1 ? "s" : ""}`))))
    .child(div().max_h(lines * 18).overflow_hidden().text_size(TEXT.body).line_height("18px").text_color(t.foreground).child(task.report.headline));
}

function option(id, text, recommended, onPick, t) {
  return h_flex().id(id).min_h(32).px(10).py(6).gap(8).items_center().rounded(R.control).border(1).border_color(t.border)
    .bg(t.background).text_size(TEXT.body).hover((s) => s.bg(t.hover).border_color(t.input)).active((s) => s.bg(t.selected))
    .on_click((_e, cx) => onPick(text, cx))
    .child(div().flex_1().min_w(0).text_color(t.foreground).child(text))
    .when(recommended, (el) => el.child(chip("Recommended", t.accent)));
}

/** The answer box under a question: one click per option, or own words. */
export function answerBox(task, ctx) {
  const { t, answer, busy, onAnswer, onLand } = ctx;
  const options = task.report?.options ?? [];
  const lands = landing(task);
  const hint = lands ? "Land its commits, or tell its agent what to change" : options.length ? "Pick one, or write your own answer" : "Your answer goes straight to the agent";
  return v_flex().gap(8)
    .when(options.length > 0, (el) => el.child(v_flex().gap(6).children(options.map((o, i) => option(`opt-${i}`, o, i === 0, onAnswer, t)))))
    .child(div().rounded(R.control).border(1).border_color(t.input).bg(t.background).text_size(TEXT.body).child(Textarea.new(answer).p(10)))
    .child(h_flex().gap(8).items_center()
      .child(div().flex_1().text_size(TEXT.meta).text_color(t.dim).child(hint))
      .child(button("send", busy ? "Sending…" : lands ? "Ask for changes" : "Send answer", (cx) => onAnswer(answer.value(), cx), { kind: lands ? "ghost" : "solid", disabled: busy }))
      .when(lands, (el) => el.child(button("land", `Land ${task.commits.length} commit${task.commits.length === 1 ? "" : "s"}`, (cx) => onLand(cx), { kind: "solid", disabled: busy }))));
}

/** At the top of the task dialog: the whole report, and the answer box while it waits. */
export function reportPanel(task, ctx) {
  const { t } = ctx;
  const k = kindOf(task, t);
  const r = task.report;
  return v_flex().gap(12).p(14).rounded(R.card).border(1).border_color(k.color + "40").bg(k.color + "0d")
    .child(h_flex().items_center().gap(6).child(mark(k)).child(div().flex_1())
      .child(div().text_size(TEXT.micro).text_color(t.dim).child(`${task.id} · ${ago(r.at)}`)))
    .child(div().text_size(15).line_height("21px").font_semibold().text_color(t.foreground).child(r.headline))
    .when(Boolean(r.detail), (el) => el.child(TextView.markdown(`report-${task.id}-${r.at}`, r.detail).selectable(true).text_size(TEXT.body)))
    .when(asking(task), (el) => el.child(div().h(1).bg(k.color + "30")).child(answerBox(task, ctx)));
}
