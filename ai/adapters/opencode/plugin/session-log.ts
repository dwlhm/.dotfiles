// session-log.ts — opencode plugin: append one JSONL telemetry line per
// lifecycle event. Port of the antigravity log-hook.sh. Auto-discovered from
// ~/.config/opencode/plugin/ — restart opencode after editing.

import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

const HOME = process.env.HOME || "."

function localDate(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

export default async ({ directory }: { directory: string }) => {
  const project = path.basename(directory)
  const logDir = path.join(HOME, "logs", "opencode", project)

  const write = async (entry: Record<string, unknown>) => {
    try {
      await mkdir(logDir, { recursive: true })
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        event: "unknown",
        model: null,
        phase: process.env.OPENCODE_PHASE ?? "unknown",
        tool: null,
        files_modified: [] as string[],
        error: null,
        retry_count: 0,
        token_estimate: null,
        ...entry,
      })
      await appendFile(path.join(logDir, `session-${localDate()}.jsonl`), line + "\n")
    } catch {
      // Logging must never break the session.
    }
  }

  return {
    "chat.message": async (input: { model?: { providerID: string; modelID: string } }) => {
      await write({
        event: "pre_invocation",
        model: input.model ? `${input.model.providerID}/${input.model.modelID}` : null,
      })
    },

    "tool.execute.after": async (
      input: { tool: string; args?: Record<string, unknown> },
      output: { metadata?: { error?: unknown } }
    ) => {
      const args = input.args ?? {}
      const files: string[] = []
      if (typeof args.filePath === "string") files.push(args.filePath)
      if (Array.isArray(args.paths)) {
        for (const p of args.paths) if (typeof p === "string") files.push(p)
      }
      await write({
        event: "post_tool",
        tool: input.tool,
        files_modified: files,
        error: output?.metadata?.error != null ? String(output.metadata.error) : null,
      })
    },

    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type === "session.idle") {
        await write({ event: "stop" })
      } else if (event.type === "session.error") {
        const props = (event.properties ?? {}) as { error?: unknown }
        await write({
          event: "session_error",
          error: props.error != null ? String(props.error) : "unknown session error",
        })
      }
    },
  }
}
