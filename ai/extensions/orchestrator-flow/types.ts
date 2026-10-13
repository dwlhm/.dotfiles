export type Phase = "idle" | "analysis" | "gate" | "implement" | "delta-pending";
export type PhaseSource = "auto" | "manual";
export type Tier = 0 | 1 | 2;
export type KbSource = "registry" | "fallback" | "unresolved";

export interface KbResolution {
	projectName: string;
	projectDir: string | null;
	workspacePath: string | null;
	files: string[];
	source: KbSource;
}

export type KbResolveError =
	| { kind: "index-unreadable"; cause: string }
	| { kind: "unindexed"; cwd: string; fallbackName: string };

export interface ContextUsageInfo {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
}

export interface SyncResult {
	ok: boolean;
	code: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}
