import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { BorderedLoader, DynamicBorder } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Container, Key, matchesKey, Text } from "@earendil-works/pi-tui";
import type { SyncResult } from "./types.js";

export function resolveSyncScriptPath(): string {
	return path.join(os.homedir(), ".dotfiles", "ai", "scripts", "sync.sh");
}

export async function runSyncScript(pi: ExtensionAPI): Promise<SyncResult> {
	const scriptPath = resolveSyncScriptPath();
	try {
		await fs.promises.stat(scriptPath);
	} catch {
		return {
			ok: false,
			code: -1,
			stdout: "",
			stderr: `sync.sh not found at ${scriptPath}`,
			timedOut: false,
		};
	}

	try {
		const res = await pi.exec("bash", [scriptPath], { timeout: 30_000 });
		return {
			ok: res.code === 0 && !res.killed,
			code: res.code,
			stdout: res.stdout ?? "",
			stderr: res.stderr ?? "",
			timedOut: Boolean(res.killed),
		};
	} catch (err: any) {
		return {
			ok: false,
			code: -1,
			stdout: "",
			stderr: err?.message ?? "Execution failed",
			timedOut: false,
		};
	}
}

export class SyncResultDialog implements Component {
	private container: Container;
	private cachedWidth = 0;
	private cachedLines: string[] = [];

	constructor(private opts: { result: SyncResult; theme: Theme; onClose: () => void }) {
		this.container = new Container();
		const t = opts.theme;
		const res = opts.result;
		const borderFg = res.ok ? "success" : "error";

		this.container.addChild(new DynamicBorder((s: string) => t.fg(borderFg, s)));
		const statusText = res.ok ? t.fg("success", t.bold(" ✓ Sync Completed ")) : t.fg("error", t.bold(` ✗ Sync Failed (exit ${res.code}) `));
		this.container.addChild(new Text(statusText, 1, 0));

		const body = (res.stdout + (res.stderr ? `\nSTDERR:\n${res.stderr}` : "")).trim() || "(no output)";
		this.container.addChild(new Text(t.fg("muted", body), 1, 1));
		this.container.addChild(new Text(t.fg("dim", " [esc / enter] close "), 1, 0));
		this.container.addChild(new DynamicBorder((s: string) => t.fg(borderFg, s)));
	}

	render(width: number): string[] {
		if (this.cachedWidth !== width) {
			this.cachedWidth = width;
			this.cachedLines = this.container.render(width);
		}
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = 0;
		this.container.invalidate();
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || data === "q" || matchesKey(data, Key.ctrl("c"))) {
			this.opts.onClose();
		}
	}
}

export function registerSyncCommand(pi: ExtensionAPI): void {
	pi.registerCommand("sync", {
		description: "Run ~/.dotfiles/ai/scripts/sync.sh (regenerate agent stubs and sync)",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				await runSyncScript(pi);
				return;
			}

			if (ctx.mode === "tui") {
				let result: SyncResult | null = null;
				await ctx.ui.custom<void>((tui, theme, _kb, done) => {
					const loader = new BorderedLoader(tui, theme, "Running sync.sh...");
					runSyncScript(pi).then((res) => {
						result = res;
						done();
					});
					return loader;
				});

				if (result) {
					await ctx.ui.custom<void>(
						(_tui, theme, _kb, done) => {
							const dialog = new SyncResultDialog({
								result: result!,
								theme,
								onClose: () => done(),
							});
							return {
								render: (w) => dialog.render(w),
								invalidate: () => dialog.invalidate(),
								handleInput: (data) => dialog.handleInput(data),
							};
						},
						{ overlay: true, overlayOptions: { width: "80%", maxHeight: "80%" } },
					);
				}
			} else {
				const res = await runSyncScript(pi);
				ctx.ui.notify(res.ok ? "sync.sh succeeded" : `sync.sh failed (exit ${res.code}): ${res.stderr}`, res.ok ? "info" : "error");
			}
		},
	});
}
