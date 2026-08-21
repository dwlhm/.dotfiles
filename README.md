# homedir

Personal home directory and system configurations.

## Structure

```
~/homedir/
└── antigravity/        # Google Antigravity (AGY) global config
    ├── rules/          # Agent behavior rules (always loaded)
    ├── hooks/          # Lifecycle hook scripts
    ├── skills/         # On-demand skill definitions
    ├── hooks.json      # Hook registration
    └── mcp_config.json # MCP server configuration
```

## Setup on a new machine

### 1. Clone the repo

```bash
git clone <your-repo-url> ~/homedir
```

### 2. Symlink AGY config

```bash
# Backup existing config if any
mv ~/.gemini/config ~/.gemini/config.bak

# Create symlink
ln -s ~/homedir/antigravity ~/.gemini/config
```

### 3. Restore machine-specific files

`config.json` is not tracked (machine-specific). Restore from backup or create fresh:

```bash
cp ~/.gemini/config.bak/config.json ~/homedir/antigravity/config.json
```

AGY will recreate `plugins/` and `projects/` automatically on first run.

## What is and isn't tracked

| Path | Tracked | Reason |
|---|---|---|
| `antigravity/rules/` | ✅ Yes | Agent behavior rules |
| `antigravity/hooks/` | ✅ Yes | Lifecycle hooks |
| `antigravity/skills/` | ✅ Yes | Custom skills |
| `antigravity/hooks.json` | ✅ Yes | Hook registration |
| `antigravity/mcp_config.json` | ✅ Yes | MCP server config |
| `antigravity/config.json` | ❌ No | Machine-specific settings |
| `antigravity/plugins/` | ❌ No | Managed by AGY runtime |
| `antigravity/projects/` | ❌ No | Session state |
