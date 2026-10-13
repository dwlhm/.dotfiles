import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Store } from "./state.js";

export function buildNudgeMessage(projectName: string): string {
	return `Second Brain: Work settled for [${projectName}]. Update adr.md, gotchas.md, vocabulary.md, or wip.md if new knowledge was discovered.`;
}

export function registerSecondBrainNudge(pi: ExtensionAPI, store: Store): void {
	pi.on("agent_settled", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		const state = store.get();
		if (!state.nudged && state.phase === "delta-pending" && state.kb?.projectDir) {
			ctx.ui.notify(buildNudgeMessage(state.kb.projectName), "info");
			store.set({ nudged: true });
		}
	});
}
