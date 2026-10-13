# Project Knowledge Index

Master registry mapping workspace project paths to centralized knowledge repositories in `~/.dotfiles/ai/knowledge/`.

---

## Resolution Protocol

When resolving knowledge base paths for a workspace:
1. **Index Lookup**: Check the table below for an exact match against the absolute workspace directory path (or parent project root).
2. **Fallback**: If no match is found, fallback to `~/.dotfiles/ai/knowledge/<basename>/` where `<basename>` is the basename of `$PWD` at session start.
3. **Registration**: When indexing a new project or modifying project locations, update this registry table with the workspace path, knowledge folder name, primary tech stack, and indexing status.

---

## Project Registry

| Project Name | Workspace Path | Tech Stack | Status | Last Indexed | Notes |
|---|---|---|---|---|---|
| `dotfiles` | `/Users/dwlhm/.dotfiles` | Shell, Configs | Indexed | 2026-08-22 | Dotfiles and Antigravity system configurations |
| `launch` | `/Users/dwlhm/project/sandbox/launch` | Kotlin, Jetpack Compose, Material 3, Android AppWidgets | Indexed | 2026-08-22 | Ergonomic single-handed Android launcher with wave alphabet scrollbar, radial quick launch, and widget interop |
| `teras` | `/Users/dwlhm/project/teras` | TypeScript, SharedArrayBuffer, Web Workers, Vite, Vitest | Indexed | 2026-09-01 | High-performance Fixed-Memory Data-Oriented UI runtime |
| `titik` | `/Users/dwlhm/project/titik` | Swift 6, SwiftUI, AppKit, SPM, Xcode | Indexed | 2026-10-03 | Ultra-fast native macOS command center overlay with liquid glass, spring physics, and dynamic plugins |
| `finan` | `/Users/dwlhm/project/sandbox/finan` | Java 17, Android Views, SQLite, Material Components, App Widgets | Indexed | 2026-09-05 | Capture-first Indonesian financial tracker; manual 4-tier architecture (ui/service/data/domain), SQLite migrations v1–v12, home-screen widgets |
| `soca` | `/Users/dwlhm/project/soca` | Odin, Web (JS/DOM), Android (Kotlin/Compose), iOS (Swift/SwiftUI) | Indexed | 2026-09-08 | Teras UI DSL compiler written in Odin, emitting Web/Android/iOS native UI code |
| `term` | `/Users/dwlhm/project/term` | Odin, Terminal Emulator, Ring Buffer, Damage Tracking | Indexed | 2026-09-09 | High-performance terminal emulator with semantic grid, O(1) scroll, hierarchical damage tracking |

| `runa` | `/Users/dwlhm/project/runa` | Swift 6, SwiftUI, macOS 26, local Markdown | Indexed | 2026-09-20 | Native single-window notebook; checked-in Xcode project |
| `react-rsc` | `/Users/dwlhm/project/react-rsc` | TypeScript, React 19, RSC, Vite, Express 5 | Indexed | 2026-09-22 | Bare-metal React Server Components: 3 separate entry points, no directives, no manifest. |
| `supernova` | `/Users/dwlhm/komerce/supernova` | TypeScript, Node, Supernova Exporter, Mitosis, VitePress, GitHub Actions | Partial | 2026-10-05 | Supernova design-token/component exporter monorepo; gotchas [supernova-01]–[supernova-03] and one ADR on component-set ownership |

- `soca`: Teras UI DSL compiler written in Odin, emitting Web/Android/iOS native UI code.
- `term`: High-performance terminal emulator with semantic grid, O(1) scroll via ring buffer, hierarchical damage tracking.

---

## Maintenance Guide

- **Adding a Project**:
  1. Create directory `~/.dotfiles/ai/knowledge/<project-name>/`.
  2. Populate initial knowledge files from `~/.dotfiles/ai/knowledge/_template/`.
  3. Add a new row to the **Project Registry** table above with status `Indexed` and current date.

- **Updating Project Status**:
  - `Indexed`: Knowledge base is initialized, scaffolded, and reflects current state.
  - `Partial`: Knowledge base has been initialized but needs further scanning or detail.
  - `Deprecated` / `Archived`: Project is no longer actively maintained.
