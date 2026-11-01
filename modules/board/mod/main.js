// board: a kanban of tasks for the person and their agents, over the `board` CLI's store.
// One mod, three roles: the board itself, and its detail and new-task dialogs (overlays).
import { View, div } from "gpui-kit";
import { props } from "herdr";
import Board from "./board.js";
import Compose from "./compose.js";
import Detail from "./detail.js";

const ROLES = { board: Board, detail: Detail, compose: Compose };

export default class BoardMod extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const Role = ROLES[pr.role ?? "board"];
    this.role = Role ? new Role() : null;
    this.role?.init(pr, cx);
  }

  render(cx) {
    if (!this.role) return div().child(`board: no role "${props()?.role}"`);
    return this.role.render(cx);
  }
}
