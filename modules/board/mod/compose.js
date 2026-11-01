// New task dialog: title, brief, folder and (optionally) the agent that starts on it. With `from`
// it makes a follow-up of that task (`board fork`): its folder, its agent forking its session by
// default. Plan first (on by default) has the agent plan and wait for the person's approval
// before it works. In git the agent works in its own worktree; a checkbox lets it land its commits
// itself. The fields scroll; the error and the buttons below them always stay in view.
import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, Textarea, TextareaState } from "gpui-base";
import { closeOverlay, focused, home, pickFolder, props, theme } from "herdr";
import { board } from "./data.js";
import { agentMark, button, checkbox, R, TEXT } from "./ui.js";

const tilde = (p) => (p.startsWith(home()) ? `~${p.slice(home().length)}` : p);
const untilde = (p) => (p === "~" || p.startsWith("~/") ? home() + p.slice(1) : p);

export default class Compose {
  init(p, cx) {
    this.programs = p.programs ?? {};
    this.from = p.from ?? null;
    this.agent = this.from ? this.from.assignee?.agent ?? null : p.agent ?? Object.keys(this.programs)[0] ?? null;
    this.autoLand = false;
    this.planFirst = true;
    this.error = "";
    this.busy = false;
    const clear = (_e, cx) => { this.error = ""; cx.notify(); };
    this.title = InputState.new({ placeholder: "What should be done?", value: this.from?.title ?? "" });
    this.title.on("submit", (_e, cx) => this.create(cx));
    this.title.on("change", clear);
    this.brief = TextareaState.new({ placeholder: "Details, where to look, how to check it (optional)", rows: 6 });
    this.folder = InputState.new({ placeholder: "Folder the agent works in", value: tilde(this.from?.cwd ?? p.folder ?? focused()?.cwd ?? home()) });
    this.folder.on("submit", (_e, cx) => this.create(cx));
    this.folder.on("change", clear);
    this.title.focus();
    cx.timer.after(300, () => this.title.focus());
  }

  create(cx) {
    const title = this.title.value().trim();
    const folder = untilde(this.folder.value().trim());
    if (!title) { this.error = "A task needs a title."; return cx.notify(); }
    if (!folder) { this.error = "A task needs a folder."; return cx.notify(); }
    if (this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const args = this.from ? ["fork", this.from.id, "--brief", this.brief.value()] : ["add", "--cwd", folder, "--brief", this.brief.value()];
      if (this.agent) args.push("--agent", this.agent);
      if (this.autoLand) args.push("--auto-land");
      if (this.planFirst) args.push("--plan");
      try {
        await board([...args, "--", title]);
        closeOverlay(props().overlay);
      } catch (e) {
        this.error = e.message;
        this.busy = false;
        cx.notify();
      }
    });
  }

  chooseFolder(cx) {
    cx.spawn(async (cx) => {
      const f = await pickFolder({ prompt: "Folder the agent works in" });
      if (f) { this.folder.set_value(tilde(f)); this.error = ""; cx.notify(); }
    });
  }

  field(label, el) {
    const t = theme();
    return v_flex().gap(6).child(div().text_size(TEXT.meta).font_medium().text_color(t.muted).child(label)).child(el);
  }

  agentOption(name, t) {
    const on = this.agent === name;
    return h_flex().id(`agent-${name ?? "none"}`).h(30).px(10).gap(6).items_center().rounded(R.control - 2)
      .text_size(TEXT.body).text_color(on ? t.foreground : t.muted)
      .when(on, (el) => el.bg(t.background).shadow_xs())
      .when(!on, (el) => el.hover((s) => s.text_color(t.foreground)))
      .on_click((_e, cx) => { this.agent = name; cx.notify(); })
      .when(Boolean(name), (el) => el.child(agentMark(name, this.programs[name], 14)))
      .child(name ?? "Later");
  }

  fields(t) {
    const frame = (el) => el.rounded(R.control).border(1).border_color(t.input).bg(t.background).text_color(t.foreground).text_size(TEXT.body);
    return v_flex().id("compose-fields").flex_1().min_h(0).overflow_y_scrollbar().px(20).gap(16)
      .child(this.field("Title", frame(Input.new(this.title).h(34).px(10).items_center())))
      .child(this.field("Brief", frame(Textarea.new(this.brief).p(10))))
      .when(!this.from, (el) => el.child(this.field("Folder", h_flex().gap(8).items_center()
        .child(frame(Input.new(this.folder).flex_1().min_w(0).h(30).px(10).items_center()))
        .child(button("folder", "Choose…", (cx) => this.chooseFolder(cx))))))
      // Segmented control: inner radius = outer (7) - padding (2).
      .child(this.field("Agent", h_flex().p(2).gap(2).rounded(R.control).bg(t.raised).self_start()
        .children([...Object.keys(this.programs), null].map((a) => this.agentOption(a, t)))))
      .child(this.field("Plan", v_flex().gap(4)
        .child(checkbox("plan-first", "Plan first", this.planFirst, (on, cx) => { this.planFirst = on; cx.notify(); }))
        .child(div().text_size(TEXT.meta).text_color(t.dim)
          .child(this.planFirst ? "The agent researches and hands you a plan; it starts the work once you approve it." : "The agent starts the work at once."))))
      .child(this.field("In git", v_flex().gap(4)
        .child(checkbox("auto-land", "The agent may commit straight to the branch", this.autoLand, (on, cx) => { this.autoLand = on; cx.notify(); }))
        .child(div().text_size(TEXT.meta).text_color(t.dim)
          .child(this.autoLand ? "Its commits land on the folder's branch as soon as it is done." : "It works in its own worktree; you land its commits when it is done."))));
  }

  render() {
    const t = theme();
    const verb = this.from ? "Follow up" : "Create";
    const start = this.agent ? `${verb} & start ${this.agent}` : verb;
    const heading = this.from ? `Follow up on ${this.from.id}` : "New task";
    return v_flex().size_full().py(20).gap(16).bg(t.popover)
      .child(div().flex_none().px(20).text_size(15).font_semibold().text_color(t.foreground).child(heading))
      .when(Boolean(this.from), (el) => el.child(div().flex_none().px(20).text_size(TEXT.meta).text_color(t.muted)
        .child(`In ${tilde(this.from.cwd)}. The same agent continues from a copy of its conversation; another agent starts with its report.`)))
      .child(this.fields(t))
      .when(Boolean(this.error), (el) => el.child(div().id("compose-error").flex_none().max_h(64).overflow_y_scrollbar().px(20).text_size(TEXT.meta).text_color(t.blocked).child(this.error)))
      .child(h_flex().flex_none().px(20).gap(8).justify_end()
        .child(button("cancel", "Cancel", () => closeOverlay(props().overlay)))
        .child(button("create", this.busy ? "Creating…" : start, (cx) => this.create(cx), { kind: "solid", disabled: this.busy })));
  }
}
