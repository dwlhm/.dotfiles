// A task's commits in the task dialog: what it changed (`task.commits`, kept once landed), each
// one opening its `git show --stat` from the task's repository.
import { div } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { exec } from "herdr";
import { R, TEXT } from "./ui.js";

/** Loads one commit's stat into `state.stat` (`state.shown` = its sha, or null to close it). */
export function showCommit(task, sha, state, cx) {
  if (state.shown === sha) { state.shown = null; return cx.notify(); }
  Object.assign(state, { shown: sha, stat: "" });
  cx.notify();
  cx.spawn(async (cx) => {
    const r = await exec("git", ["-C", task.worktree?.top ?? task.cwd, "show", "--stat", "--format=%b", sha]).catch((e) => ({ stdout: "", stderr: String(e) }));
    if (state.shown === sha) state.stat = (r.stdout || r.stderr).trim() || "(no changes)";
    cx.notify();
  });
}

export function commitList(task, state, t, onShow) {
  return v_flex().gap(2).children(task.commits.map((c) => v_flex()
    .child(h_flex().id(`c-${c.sha}`).h(26).px(8).gap(8).items_center().rounded(R.chip).text_size(TEXT.body)
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => onShow(c.sha, cx))
      .child(div().flex_none().font_family("monospace").text_size(TEXT.meta).text_color(t.dim).child(c.sha.slice(0, 9)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(c.subject)))
    .when(state.shown === c.sha, (el) => el.child(div().mx(8).mb(4)
      .child(TextView.markdown(`stat-${c.sha}`, `\`\`\`\n${state.stat || "Loading…"}\n\`\`\``).selectable(true).text_size(TEXT.micro))))));
}
