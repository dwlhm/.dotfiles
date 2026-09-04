---
name: plugin-manager
description: >
  Manage opencode plugins and MCP servers — globally via opencode.jsonc or
  via auto-discovered plugin files. Use when a plugin or MCP server needs to
  be enabled, disabled, added, or removed, or when debugging plugin loading.
---

# Plugin Manager Skill

## Current Global Plugins & MCP Servers

| Name | Type | Enabled | Use Case |
|---|---|---|---|
| `session-log` | plugin (auto-discovered) | ✅ | JSONL session telemetry → `~/logs/opencode/` |

---

## How to Manage Plugins

### Auto-discovered plugins (recommended)

Any `*.ts` or `*.js` file in `~/.config/opencode/plugin/` (symlinked from
`~/.dotfiles/ai/adapters/opencode/plugin/`) is loaded automatically — no config
entry needed. To disable one, move it out of the directory or rename the
extension.

A plugin module exports a function (async) that receives
`{ client, project, directory, $ }` and returns a hooks object
(return `{}` if there is nothing to register):

```ts
export default async ({ directory }) => {
  return {
    "tool.execute.before": async (input, output) => {
      // mutate output.args before the tool runs
    },
  }
}
```

### Declared plugins

Add npm packages or file paths to the `plugin` array in
[`~/.config/opencode/opencode.jsonc`](file:///Users/dwlhm/.config/opencode/opencode.jsonc):

```jsonc
{
  "plugin": [
    "opencode-some-plugin",           // npm spec
    "opencode-other@1.2.3",           // pinned
    ["opencode-tuple", { "key": "val" }] // with options
  ]
}
```

### Per-Project (override global)

Create or edit `opencode.json` (or `.opencode/opencode.json`) at the project
root. Project configs deep-merge over global config. Only specify what you want
to override.

Add the file to `.gitignore` if it contains machine-specific config, or commit
it if the override should apply to the whole team.

---

## How to Manage MCP Servers

MCP servers live under the `mcp` key in `opencode.jsonc`, keyed by name. Each
server requires `type`:

```jsonc
{
  "mcp": {
    "some-server": {
      "type": "local",
      "command": ["node", "/path/to/server.mjs"],
      "enabled": false   // set false to disable without deleting
    },
    "remote-thing": {
      "type": "remote",
      "url": "https://..."
    }
  }
}
```

`command` is always an array of strings. Use `"enabled": false` to disable a
server inherited from a parent config.

---

## Adding a New Plugin or Server

1. For file-based plugins: place the file in `~/.dotfiles/ai/adapters/opencode/plugin/`.
2. For npm plugins / MCP servers: add the entry to `~/.config/opencode/opencode.jsonc`.
3. Document it in the table above.
4. Restart opencode — config and plugins load at startup only.
