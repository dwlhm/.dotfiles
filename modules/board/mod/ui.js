// The board's design system: tokens and the small pieces every view shares. Colors come from
// the Herdr theme only; icons are the app's own (workspace-chrome) so strokes match its chrome.
import { div, svg, image } from "gpui-kit";
import { h_flex, Avatar, AvatarFallback, Button, Checkbox, Progress, ProgressTrack, ProgressIndicator } from "gpui-base";
import { home, settings, theme } from "herdr";

// Concentric radii: a card sits 6px inside its column, so card = column - 6.
export const R = { column: 14, card: 8, control: 7, chip: 5 };
export const GAP = { column: 6, card: 10 };
export const TEXT = { title: 13, body: 12.5, meta: 11.5, micro: 10.5 };

export const PHASE = {
  backlog: { label: "Backlog", tone: "dim" },
  plan: { label: "Plan", tone: "accent" },
  work: { label: "Work", tone: "working" },
  review: { label: "Review", tone: "accent" },
  test: { label: "Test", tone: "working" },
  waiting: { label: "Waiting", tone: "blocked" },
  done: { label: "Done", tone: "done" },
  failed: { label: "Failed", tone: "blocked" },
};
/** Board columns, left to right; failed cards share the Done column. */
export const COLUMNS = ["backlog", "plan", "work", "review", "test", "waiting", "done"];
export const columnOf = (phase) => (phase === "failed" ? "done" : phase);
export const tone = (t, name) => t[PHASE[name]?.tone ?? "dim"] ?? t.dim;

export const icon = (name, size = 13) => svg(`mods/workspace-chrome/${name}.svg`).size(size).flex_none();

/** A raised surface: tint + 1px border in dark mode, two soft shadows in light. */
export function surface(el, t) {
  const dark = settings()?.dark;
  return el.bg(t.background).border(1).border_color(dark ? t.border : t.border + "b0")
    .when(!dark, (e) => e.shadow_xs());
}

export function chip(text, color, opts = {}) {
  return h_flex().flex_none().gap(4).h(18).px(6).rounded(R.chip).bg(color + "1f")
    .text_size(TEXT.micro).font_semibold().text_color(color)
    .when(Boolean(opts.icon), (el) => el.child(icon(opts.icon, 10)))
    .child(text);
}

/** A neutral label with an icon; `tip` is the hover text (e.g. the full path). */
export function tag(text, t, opts = {}) {
  return h_flex().flex_none().min_w(0).max_w(140).gap(4).h(18).px(6).rounded(R.chip).bg(t.raised)
    .text_size(TEXT.micro).font_medium().text_color(t.muted)
    .when(Boolean(opts.icon), (el) => el.child(icon(opts.icon, 10)))
    .child(div().min_w(0).truncate().child(text))
    .when(Boolean(opts.tip), (el) => el.tooltip(opts.tip));
}

export const tilde = (p) => (p.startsWith(home()) ? `~${p.slice(home().length)}` : p);
const base = (p) => p.replace(/\/+$/, "").split("/").pop() || "/";

/** cwd → short name for every folder given: its own name, or `parent/name` where two share it. */
export function folderLabels(cwds) {
  const uniq = [...new Set(cwds)];
  return Object.fromEntries(uniq.map((cwd) => {
    if (cwd === home()) return [cwd, "~"];
    const clash = uniq.some((o) => o !== cwd && base(o) === base(cwd));
    return [cwd, clash ? tilde(cwd).split("/").slice(-2).join("/") : base(cwd)];
  }));
}

/** One option of a segmented control (track: `p(2)` on `t.raised`, so radius = control - 2). */
export function segment(id, on, onClick, t) {
  return h_flex().id(id).flex_none().h(26).px(10).gap(6).items_center().rounded(R.control - 2)
    .text_size(TEXT.meta).font_medium().text_color(on ? t.foreground : t.muted)
    .when(on, (el) => el.bg(t.background).shadow_xs())
    .when(!on, (el) => el.hover((s) => s.text_color(t.foreground)))
    .on_click((_e, cx) => onClick(cx));
}

/** A labelled checkbox (gpui-base draws none: the box and its check are ours). */
export function checkbox(id, label, on, onChange) {
  const t = theme();
  return Checkbox.new(id).flex().gap(8).items_center().self_start().text_size(TEXT.body).text_color(t.foreground)
    .checked(on).on_change((checked, cx) => onChange(checked, cx))
    .child(div().size(16).flex_none().flex().items_center().justify_center().rounded(R.chip - 1).border(1)
      .border_color(on ? t.solid : t.input).bg(on ? t.solid : t.background)
      .when(on, (el) => el.text_color(t.solid_foreground).child(icon("check", 11))))
    .child(label);
}

/** A text button; `kind`: "solid" (primary), "ghost" or "danger". Hit area ≥ 28px. */
export function button(id, label, onClick, opts = {}) {
  const t = theme();
  const kind = opts.kind ?? "ghost";
  const fg = kind === "solid" ? t.solid_foreground : kind === "danger" ? t.blocked : t.foreground;
  return Button.new(id).h(28).px(10).gap(6).flex().items_center().rounded(R.control)
    .text_size(TEXT.body).font_medium().text_color(fg)
    .when(kind === "solid", (el) => el.bg(t.solid).hover((s) => s.opacity(0.9)).active((s) => s.opacity(0.8)))
    .when(kind !== "solid", (el) => el.border(1).border_color(t.border).hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)))
    .when(Boolean(opts.disabled), (el) => el.disabled(true).opacity(0.5))
    .when(Boolean(opts.icon), (el) => el.child(icon(opts.icon, 13)))
    .child(label)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { if (!opts.disabled) onClick(cx); });
}

/** A 16px glyph in a 28px target. */
export function iconButton(id, name, tip, onClick) {
  const t = theme();
  return Button.new(id).size(28).flex().items_center().justify_center().rounded(R.control)
    .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).active((s) => s.bg(t.selected))
    .tooltip(tip).child(icon(name, 14))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => onClick(cx));
}

/** What the agent's terminal reports right now: spinner, "Needs you" or a quiet dot. */
export function liveMark(live, t) {
  if (!live) return div().size(6).flex_none().rounded(3).border(1.5).border_color(t.dim);
  if (live.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
  if (live.status === "blocked") return chip("Needs you", t.blocked);
  return div().size(6).flex_none().rounded(3).bg(live.status === "done" ? t.done : t.idle ?? t.dim);
}

/** The agent's program icon when Herdr knows it, else its initial. */
export function agentMark(name, program, size = 16) {
  const t = theme();
  if (program?.icon) {
    return program.tint ? svg(program.icon).size(size).flex_none().text_color(t.muted) : image(program.icon).w(size).h(size).flex_none();
  }
  return Avatar.new().size(size).flex_none().rounded_full().bg(t.raised).fallback(
    AvatarFallback.new().size_full().flex().items_center().justify_center()
      .text_size(size * 0.6).font_semibold().text_color(t.muted).child((name ?? "?").slice(0, 1).toUpperCase()));
}

export function progress(id, done, total, t, width = 44) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h_flex().flex_none().gap(6).items_center().text_size(TEXT.micro).text_color(t.muted)
    .child(Progress.new(id).value(pct).child(
      ProgressTrack.new().w(width).h(4).rounded(2).bg(t.border).overflow_hidden().child(
        ProgressIndicator.new().h_full().w(width * pct / 100).rounded(2).bg(pct === 100 ? t.done : t.accent).transition("width", 200))))
    .child(`${done}/${total}`);
}
