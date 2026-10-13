import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import type { Store, OrchestratorFlowState } from "./state.js";
import type { ContextUsageInfo, Phase } from "./types.js";

const PHASE_ICONS: Record<Phase, string> = {
	idle: "○",
	analysis: "◎",
	gate: "◆",
	implement: "▶",
	"delta-pending": "◐",
};

export function renderStatusLine(state: Readonly<OrchestratorFlowState>, usage: ContextUsageInfo | undefined, theme: Theme): string {
	const icon = PHASE_ICONS[state.phase] ?? "○";
	const manualMarker = state.phaseSource === "manual" ? "*" : "";
	const phaseStr = `${icon} ${state.phase}${manualMarker}`;

	const tierStr = state.tier !== null ? `T${state.tier}` : "T–";

	let pctStr = "–%";
	if (usage && typeof usage.percent === "number") {
		pctStr = `${Math.round(usage.percent)}%`;
	}

	const kbStr = state.kb?.projectDir ? state.kb.projectName : "no-kb";

	return [
		theme.fg("accent", phaseStr),
		theme.fg("muted", tierStr),
		theme.fg("dim", pctStr),
		theme.fg(state.kb?.projectDir ? "muted" : "dim", kbStr),
	].join(theme.fg("dim", " · "));
}

export function registerStatusLine(pi: ExtensionAPI, store: Store): void {
	const update = (ctx: { ui: { setStatus: (k: string, v?: string) => void; theme: Theme }; getContextUsage?: () => any; hasUI: boolean }) => {
		if (!ctx.hasUI) return;
		const usage = ctx.getContextUsage?.() as ContextUsageInfo | undefined;
		const text = renderStatusLine(store.get(), usage, ctx.ui.theme);
		ctx.ui.setStatus("orchestrator-flow", text);
	};

	store.subscribe(() => {
		// Handled on lifecycle events with valid ctx
	});

	pi.on("session_start", async (_event, ctx) => update(ctx));
	pi.on("message_end", async (_event, ctx) => update(ctx));
	pi.on("agent_settled", async (_event, ctx) => update(ctx));
	pi.on("session_compact", async (_event, ctx) => update(ctx));

	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.hasUI) {
			ctx.ui.setStatus("orchestrator-flow", undefined);
		}
	});
}
