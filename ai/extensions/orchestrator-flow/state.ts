import type { KbResolution, Phase, PhaseSource, Tier } from "./types.js";

export interface OrchestratorFlowState {
	phase: Phase;
	phaseSource: PhaseSource;
	tier: Tier | null;
	kb: KbResolution | null;
	ranSubagentThisRun: boolean;
	nudged: boolean;
}

export interface Store {
	get(): Readonly<OrchestratorFlowState>;
	set(patch: Partial<OrchestratorFlowState>): void;
	subscribe(listener: (state: Readonly<OrchestratorFlowState>) => void): () => void;
}

export function createStore(): Store {
	let state: OrchestratorFlowState = {
		phase: "idle",
		phaseSource: "auto",
		tier: null,
		kb: null,
		ranSubagentThisRun: false,
		nudged: false,
	};
	const listeners = new Set<(s: Readonly<OrchestratorFlowState>) => void>();

	return {
		get() {
			return state;
		},
		set(patch) {
			state = { ...state, ...patch };
			for (const l of listeners) l(state);
		},
		subscribe(l) {
			listeners.add(l);
			return () => listeners.delete(l);
		},
	};
}
