import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Phase, Tier } from "./types.js";
import type { Store } from "./state.js";

export const SUBAGENT_TOOL_NAME = "subagent";
export const VALID_PHASES: readonly Phase[] = ["idle", "analysis", "gate", "implement", "delta-pending"] as const;

export function parsePhaseArg(arg: string): Phase | null {
	const clean = arg.trim().toLowerCase();
	return (VALID_PHASES as readonly string[]).includes(clean) ? (clean as Phase) : null;
}

export function registerPhaseTracking(pi: ExtensionAPI, store: Store): void {
	pi.on("session_start", async () => {
		store.set({ phase: "idle", phaseSource: "auto", ranSubagentThisRun: false, nudged: false });
	});

	pi.on("agent_start", async () => {
		store.set({ phase: "analysis", phaseSource: "auto", ranSubagentThisRun: false });
	});

	pi.on("tool_execution_start", async (event) => {
		if (event.toolName === SUBAGENT_TOOL_NAME) {
			store.set({ phase: "implement", phaseSource: "auto", ranSubagentThisRun: true });
		}
	});

	pi.on("agent_settled", async () => {
		const ran = store.get().ranSubagentThisRun;
		store.set({ phase: ran ? "delta-pending" : "idle", phaseSource: "auto" });
	});

	pi.registerCommand("phase", {
		description: "Set orchestrator phase manually (overrides auto-tracking until next automatic transition)",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items: AutocompleteItem[] = VALID_PHASES.map((p) => ({ value: p, label: p }));
			const filtered = items.filter((i) => i.value.startsWith(prefix.toLowerCase()));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				const current = store.get();
				ctx.ui.notify(`Current phase: ${current.phase} (${current.phaseSource})`, "info");
				return;
			}
			const parsed = parsePhaseArg(trimmed);
			if (!parsed) {
				ctx.ui.notify(`Invalid phase: "${trimmed}". Valid: ${VALID_PHASES.join(", ")}`, "warning");
				return;
			}
			store.set({ phase: parsed, phaseSource: "manual" });
			ctx.ui.notify(`Phase set to: ${parsed} (manual)`, "info");
		},
	});

	pi.registerCommand("tier", {
		description: "Set task tier (0, 1, or 2) shown in footer status line",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items: AutocompleteItem[] = [
				{ value: "0", label: "0", description: "Trivial / typo" },
				{ value: "1", label: "1", description: "Simple (≤2 files, isolated)" },
				{ value: "2", label: "2", description: "Architectural / multi-file" },
			];
			const filtered = items.filter((i) => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				const current = store.get().tier;
				ctx.ui.notify(`Current tier: ${current !== null ? `T${current}` : "none"}`, "info");
				return;
			}
			if (trimmed === "0" || trimmed === "1" || trimmed === "2") {
				const tier = Number(trimmed) as Tier;
				store.set({ tier });
				ctx.ui.notify(`Tier set to: T${tier}`, "info");
			} else {
				ctx.ui.notify(`Invalid tier: "${trimmed}". Valid: 0, 1, 2`, "warning");
			}
		},
	});
}
