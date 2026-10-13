import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createStore } from "./state.js";
import { registerPhaseTracking } from "./phase.js";
import { registerStatusLine } from "./status.js";
import { registerKbCommand } from "./kb.js";
import { registerSyncCommand } from "./sync.js";
import { registerSecondBrainNudge } from "./nudge.js";

export default function orchestratorFlowExtension(pi: ExtensionAPI): void {
	const store = createStore();
	registerPhaseTracking(pi, store);
	registerStatusLine(pi, store);
	registerKbCommand(pi, store);
	registerSyncCommand(pi);
	registerSecondBrainNudge(pi, store);
}
