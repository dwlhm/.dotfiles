# docs — read-only markdown viewer

`docs` serves markdown folders as an interactive local site: a source/folder tree, fuzzy search,
rendered pages (tables, highlighted code with copy, heading TOC), working relative and `[[wiki]]`
links, and live reload when a file changes. Read-only by design.

```sh
docs                                   # ~/brain + ~/.dotfiles on http://127.0.0.1:4400
bun server.ts --port 4410 --source alpha=fixtures/alpha --source beta=fixtures/beta --no-open
```

## Layout

| Path | Role |
|---|---|
| `server.ts` | Bun HTTP server: API below + static `web/` |
| `server.test.ts` | API contract tests (`bun test`) |
| `web/index.html`, `web/app.js`, `web/style.css` | UI (vanilla ES modules, no build step) |
| `web/vendor/` | Pinned `marked` 15.0.12 (MIT) and `highlight.js` 11.11.1 (BSD-3) |
| `fixtures/` | Test sources used by the tests and the QA flows |
| `.qa/web/*.anoa` | UI flows run by `qa web run` |

## Server CLI

`bun server.ts [--port <n>] [--host <h>] [--source <name>=<dir>]... [--no-open]`

- Defaults: port `4400`, host `127.0.0.1`, sources `brain=~/brain` and `dotfiles=~/.dotfiles`.
- Only `*.md` files are listed or served. Directories named `.git`, `node_modules`, `.qa` and
  any dot-directory are skipped.
- Without `--no-open` it opens the browser with `open <url>` once listening.

## HTTP API (JSON, UTF-8)

| Route | Response |
|---|---|
| `GET /api/tree` | `{"sources":[{"name","files":[{"path","title"}]}]}` — `path` is POSIX, relative to the source root, sorted; `title` is the first `# ` heading, else the file name without `.md` |
| `GET /api/doc?source=<name>&path=<path>` | `{"source","path","title","markdown","mtime"}` (`mtime` = ms epoch). Unknown source → 404; non-`.md`, missing file → 404; path escaping the root (`..`, absolute, symlink out) → 403 |
| `GET /api/search?q=<text>` | `{"results":[{"source","path","title","line","snippet"}]}` — case-insensitive match on title and content, title matches first, at most 50; `line` is 1-based (0 for a title match); `snippet` ≤ 160 chars. Empty `q` → `{"results":[]}` |
| `GET /api/events` | Server-Sent Events: `event: change` with data `{"source","path"}` whenever a `.md` file under a source is created, changed, or deleted |
| `GET /` and `GET /<file>` | Static files from `web/` (`index.html` for `/`); anything else → 404 |

## UI contract (what the QA flows rely on)

- URL routing by hash: `#/<source>/<path>` opens a document, `#/<source>/<path>#<heading-id>` scrolls
  to a heading. The empty hash opens the first file of the first source.
- `nav#tree`: one `details` per source (summary = source name) containing nested folders;
  each file is an `a` whose text is the file title and whose `href` is its hash route.
- `input#search` (focus with `/`): typing shows `ul#results` with one `li a` per result
  (text includes the title); Enter or click opens it.
- `article#doc`: rendered markdown. Headings get slug ids (`Deep Section` → `deep-section`).
  Relative `.md` links and `[[name]]` links (resolved by file name across all sources) become
  hash routes; unresolved `[[name]]` renders as `span.broken-link`.
- Each `pre` gets a `button.copy` ("Copy"). `nav#toc` lists the document's `h2`/`h3` as links.
- `h1#doc-title` mirrors the document title; `document.title` is `<title> — docs`. Titles are
  shown as plain text everywhere (tree, results, `h1#doc-title`, `document.title`): inline markdown
  such as `` `code` `` or `**bold**` is stripped. The document's first `# ` heading is not rendered
  again inside `article#doc` (so `article#doc` contains no `h1`).
- Live reload: on an SSE `change` for the open document, re-render it in place (keep scroll).
- Theme follows `prefers-color-scheme`. No console errors or uncaught exceptions on any page.
