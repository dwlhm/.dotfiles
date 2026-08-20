---
name: plugin-manager
description: >
  Manage which Antigravity plugins are active — globally, per-project, or
  on-demand via this skill. Use when a project doesn't need a plugin that
  is active globally, or when you want to enable a plugin only for specific work.
---

# Plugin Manager Skill

## Current Global Plugins

| Plugin | Enabled | Use Case |
|---|---|---|
| `android-cli-plugin` | ✅ | Android project development, AVD management, SDK |
| `chrome-devtools-plugin` | ✅ | Browser debugging, performance, a11y, memory leaks |
| `google-antigravity-sdk` | ✅ | Building and orchestrating AGY agents |
| `modern-web-guidance-plugin` | ✅ | HTML/CSS/JS best practices, UI layout, web APIs |

---

## How to Manage Plugins

### Globally (all projects)

Edit [`~/.gemini/config/config.json`](file:///Users/dwlhm/.gemini/config/config.json):

```json
{
  "plugins": {
    "android-cli-plugin": { "enabled": false },
    "chrome-devtools-plugin": { "enabled": true }
  }
}
```

Set `"enabled": false` to disable a plugin everywhere.

---

### Per-Project (override global)

Create or edit `.agents/config.json` at the root of the project:

```json
{
  "plugins": {
    "android-cli-plugin": { "enabled": false }
  }
}
```

Only specify plugins you want to override. Unspecified plugins inherit the global value.

This file should be added to `.gitignore` if it contains machine-specific config,
or committed if the override should apply to the whole team.

---

### On-Demand via Skill

To disable a plugin for the current project, say:

> "Disable `android-cli-plugin` for this project."

The agent will create or update `.agents/config.json` with the override.

To re-enable:

> "Re-enable `android-cli-plugin` for this project."

---

## Adding a New Plugin

1. Place the plugin directory under `~/.gemini/config/plugins/<plugin-name>/`.
2. Add an entry to `~/.gemini/config/config.json` under `"plugins"`.
3. Optionally document it in the table above.

See the `agy-customizations` skill for full plugin structure requirements.
