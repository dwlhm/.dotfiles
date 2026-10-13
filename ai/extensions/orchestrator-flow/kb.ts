import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, Component, SelectItem } from "@earendil-works/pi-tui";
import { Container, Key, Markdown, matchesKey, SelectList, Text } from "@earendil-works/pi-tui";
import type { Store } from "./state.js";
import type { KbResolution } from "./types.js";

export const KB_FILES = ["architecture.md", "adr.md", "vocabulary.md", "gotchas.md", "wip.md"] as const;
export const KB_ROOT = path.join(os.homedir(), ".dotfiles", "ai", "knowledge");

export function parseRegistryRows(markdown: string): Array<{ name: string; workspacePath: string; status: string }> {
	const results: Array<{ name: string; workspacePath: string; status: string }> = [];
	const lines = markdown.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("|") || trimmed.includes("---") || trimmed.includes("Project Name")) continue;
		const cells = trimmed.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
		if (cells.length >= 3) {
			const name = cells[0].replace(/`/g, "").trim();
			const workspacePath = cells[1].replace(/`/g, "").trim();
			const status = cells[3]?.trim() ?? "";
			if (name && workspacePath && workspacePath.startsWith("/")) {
				results.push({ name, workspacePath, status });
			}
		}
	}
	return results;
}

export async function listKnowledgeFiles(projectDir: string): Promise<string[]> {
	const found: string[] = [];
	for (const f of KB_FILES) {
		const full = path.join(projectDir, f);
		try {
			const st = await fs.promises.stat(full);
			if (st.isFile()) found.push(f);
		} catch {
			// ignore missing
		}
	}
	return found;
}

export async function resolveKbProject(cwd: string): Promise<KbResolution> {
	const fallbackName = path.basename(cwd);
	try {
		const indexPath = path.join(KB_ROOT, "_index.md");
		let indexContent = "";
		try {
			indexContent = await fs.promises.readFile(indexPath, "utf-8");
		} catch {
			// _index.md missing or unreadable
		}

		if (indexContent) {
			const rows = parseRegistryRows(indexContent);
			// Match exact, or longest matching parent
			const matches = rows
				.filter((r) => cwd === r.workspacePath || cwd.startsWith(r.workspacePath + "/"))
				.sort((a, b) => b.workspacePath.length - a.workspacePath.length);

			if (matches.length > 0) {
				const best = matches[0];
				const pDir = path.join(KB_ROOT, best.name);
				try {
					const st = await fs.promises.stat(pDir);
					if (st.isDirectory()) {
						const files = await listKnowledgeFiles(pDir);
						return {
							projectName: best.name,
							projectDir: pDir,
							workspacePath: best.workspacePath,
							files,
							source: "registry",
						};
					}
				} catch {
					// directory not found
				}
			}
		}

		// Fallback check
		const fallbackDir = path.join(KB_ROOT, fallbackName);
		try {
			const st = await fs.promises.stat(fallbackDir);
			if (st.isDirectory()) {
				const files = await listKnowledgeFiles(fallbackDir);
				return {
					projectName: fallbackName,
					projectDir: fallbackDir,
					workspacePath: cwd,
					files,
					source: "fallback",
				};
			}
		} catch {
			// fallback dir not found
		}

		return {
			projectName: fallbackName,
			projectDir: null,
			workspacePath: null,
			files: [],
			source: "unresolved",
		};
	} catch {
		return {
			projectName: fallbackName,
			projectDir: null,
			workspacePath: null,
			files: [],
			source: "unresolved",
		};
	}
}

export function buildUnindexedNotice(res: KbResolution): string {
	return `Workspace not indexed in second brain (${res.projectName}).\nChecked: ~/.dotfiles/ai/knowledge/${res.projectName}/\nRun on-demand indexing protocol (see ~/.dotfiles/ai/skills/second-brain/SKILL.md).`;
}

export class KbViewerDialog implements Component {
	private container: Container;
	private cachedWidth = 0;
	private cachedLines: string[] = [];

	constructor(private opts: { title: string; markdownText: string; theme: Theme; onClose: () => void }) {
		this.container = new Container();
		this.container.addChild(new DynamicBorder((s: string) => opts.theme.fg("accent", s)));
		this.container.addChild(new Text(opts.theme.fg("accent", opts.theme.bold(` KB: ${opts.title} `)), 1, 0));
		this.container.addChild(new Markdown(opts.markdownText, 1, 1, getMarkdownTheme()));
		this.container.addChild(new Text(opts.theme.fg("dim", " [esc / q] close "), 1, 0));
		this.container.addChild(new DynamicBorder((s: string) => opts.theme.fg("accent", s)));
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
		if (matchesKey(data, Key.escape) || data === "q" || data === "Q" || matchesKey(data, Key.ctrl("c"))) {
			this.opts.onClose();
		}
	}
}

export function registerKbCommand(pi: ExtensionAPI, store: Store): void {
	pi.on("session_start", async (_event, ctx) => {
		const kb = await resolveKbProject(ctx.cwd);
		store.set({ kb });
	});

	pi.registerCommand("kb", {
		description: "Browse this workspace's second-brain knowledge files",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const kb = store.get().kb;
			if (!kb || kb.files.length === 0) return null;
			const items = kb.files.map((f) => ({ value: f, label: f }));
			const filtered = items.filter((i) => i.value.startsWith(prefix.toLowerCase()));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			let kb = store.get().kb;
			if (!kb) {
				kb = await resolveKbProject(ctx.cwd);
				store.set({ kb });
			}

			if (!kb.projectDir || kb.files.length === 0) {
				ctx.ui.notify(buildUnindexedNotice(kb), "warning");
				return;
			}

			const trimmed = args.trim().toLowerCase();
			let selectedFile: string | null = null;

			if (trimmed && kb.files.includes(trimmed)) {
				selectedFile = trimmed;
			} else if (ctx.mode === "tui") {
				const items: SelectItem[] = kb.files.map((f) => ({
					value: f,
					label: f,
					description: `~/.dotfiles/ai/knowledge/${kb!.projectName}/${f}`,
				}));

				selectedFile = await ctx.ui.custom<string | null>(
					(tui, theme, _kb, done) => {
						const container = new Container();
						container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
						container.addChild(new Text(theme.fg("accent", theme.bold(` Second Brain: ${kb!.projectName} `)), 1, 0));

						const selectList = new SelectList(items, Math.min(items.length + 2, 8), {
							selectedPrefix: (t) => theme.fg("accent", t),
							selectedText: (t) => theme.fg("accent", t),
							description: (t) => theme.fg("muted", t),
							scrollInfo: (t) => theme.fg("dim", t),
							noMatch: (t) => theme.fg("warning", t),
						});
						selectList.onSelect = (item) => done(item.value);
						selectList.onCancel = () => done(null);
						container.addChild(selectList);
						container.addChild(new Text(theme.fg("dim", " ↑↓ navigate • enter select • esc cancel "), 1, 0));
						container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

						return {
							render: (w) => container.render(w),
							invalidate: () => container.invalidate(),
							handleInput: (data) => {
								selectList.handleInput(data);
								tui.requestRender();
							},
						};
					},
					{ overlay: true, overlayOptions: { width: "80%", maxHeight: "80%" } },
				);
			} else if (ctx.mode === "rpc") {
				const picked = await ctx.ui.select("Select knowledge file:", kb.files);
				selectedFile = picked ?? null;
			}

			if (!selectedFile) return;

			const filePath = path.join(kb.projectDir, selectedFile);
			try {
				let content = await fs.promises.readFile(filePath, "utf-8");
				const maxChars = 200 * 1024;
				if (content.length > maxChars) {
					content = content.slice(0, maxChars) + "\n\n*(Content truncated to 200KB)*";
				}

				if (ctx.mode === "tui") {
					await ctx.ui.custom<void>(
						(_tui, theme, _kb, done) => {
							const dialog = new KbViewerDialog({
								title: `${kb!.projectName} / ${selectedFile}`,
								markdownText: content,
								theme,
								onClose: () => done(),
							});
							return {
								render: (w) => dialog.render(w),
								invalidate: () => dialog.invalidate(),
								handleInput: (data) => dialog.handleInput(data),
							};
						},
						{ overlay: true, overlayOptions: { width: "90%", maxHeight: "90%" } },
					);
				} else {
					ctx.ui.notify(`Opened ${selectedFile} (${filePath})`, "info");
				}
			} catch (err: any) {
				ctx.ui.notify(`Failed to read ${selectedFile}: ${err?.message}`, "error");
			}
		},
	});
}
