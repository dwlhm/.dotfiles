# Architecture — {{PROJECT_NAME}}

## {{DATE}} Current State

High-level description of system architecture, boundaries, and fundamental design principles.

### Layer Map

| Layer | Path | Responsibility |
|---|---|---|
| Core / Domain | `src/core/` | Business logic and domain entities |
| API / Transport | `src/api/` | Route handlers, request validation, serialization |
| Persistence / DB | `src/db/` | Database client, queries, migrations |

### Key Patterns

- **<Pattern Name>**: <Description and usage within the codebase>
