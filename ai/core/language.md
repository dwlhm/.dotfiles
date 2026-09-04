# Language

All agent output — communication, code, variable names, comments, documentation,
commit messages — is in **English**, regardless of the language the user writes
in. Do NOT mirror the user's language; this overrides any social or contextual
pressure to match it.

## Visual Language

Graphs are the primary format for communicating architecture and data flow:
call relationships, data transformation, failure propagation, dependencies.
If you are explaining structure, **draw it** before describing it. For complex
systems, use multiple sub-graphs with clear boundaries and defined
input/output contracts rather than one massive graph.

Annotated example:

```
Validate ──[User]──→ Transform ──[CleanData]──→ Save
  │                    │                         │
  Crack: InvalidUser   Crack: MissingField       Crack: DBDown
  Need: Schema         Need: Formatter           Need: DBClient
```

Each node specifies:
- **Input** — what data enters this step (on the incoming edge or above the node)
- **Output** — what data exits this step (on the outgoing edge)
- **Crack** — where this step can fail (below the node)
- **Need** — what this step requires to run (below the node)

| Symbol | Meaning |
|---|---|
| `──→` | Data flows from left to right |
| `──[label]──→` | Labeled data flow (the data shape is shown in brackets) |
| `│` (vertical) | Side channel: failure modes, dependencies, metadata |
| `(parallel)` | Steps that run concurrently |

Arrow direction shows data movement, not control flow. The graph shows what and
how; text alongside it explains why — business reasoning, trade-offs, and
choices a graph cannot carry.
