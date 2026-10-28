import { existsSync, readdirSync, readFileSync, realpathSync, statSync, watch } from "node:fs";
import path from "node:path";

interface Source { name: string; root: string; realRoot: string; }
interface DocFile { path: string; title: string; fullPath: string; }
interface SearchResult { source: string; path: string; title: string; line: number; snippet: string; }

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8",
};

function getTitle(content: string, fileName: string): string {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) return trimmed.slice(2).trim();
  }
  return fileName.replace(/\.md$/, "");
}

function makeSnippet(text: string, query: string): string {
  const t = text.trim();
  if (t.length <= 160) return t;
  const idx = t.toLowerCase().indexOf(query.toLowerCase());
  const start = idx === -1 ? 0 : Math.max(0, idx - 60);
  return t.slice(start, Math.min(t.length, start + 160));
}

function scanDir(dir: string, baseDir: string, realRoot: string): DocFile[] {
  try {
    const results: DocFile[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      try {
        if (statSync(full).isDirectory()) {
          const real = realpathSync(full);
          if (real.startsWith(realRoot + path.sep) || real === realRoot) results.push(...scanDir(full, baseDir, realRoot));
        } else if (entry.name.endsWith(".md")) {
          const real = realpathSync(full);
          if (real.startsWith(realRoot + path.sep)) {
            results.push({ path: path.relative(baseDir, full).split(path.sep).join("/"), title: getTitle(readFileSync(real, "utf-8"), entry.name), fullPath: real });
          }
        }
      } catch {}
    }
    return results;
  } catch { return []; }
}

function resolveSafeDoc(sourceRoot: string, reqPath: string): { ok: true; fullPath: string } | { ok: false; status: 403 | 404 } {
  if (path.isAbsolute(reqPath)) return { ok: false, status: 403 };
  let realRoot: string;
  try { realRoot = realpathSync(sourceRoot); } catch { return { ok: false, status: 404 }; }
  const resolved = path.resolve(realRoot, reqPath);
  if (!resolved.startsWith(realRoot + path.sep) && resolved !== realRoot) return { ok: false, status: 403 };
  const parts = path.normalize(reqPath).split(path.sep);
  let current = realRoot;
  for (const part of parts) {
    if (!part || part === ".") continue;
    current = part === ".." ? path.dirname(current) : path.join(current, part);
    if (existsSync(current)) {
      try { current = realpathSync(current); } catch {}
    }
    if (!current.startsWith(realRoot + path.sep) && current !== realRoot) return { ok: false, status: 403 };
  }
  if (!existsSync(current)) return { ok: false, status: 404 };
  try {
    const real = realpathSync(current);
    if (!real.startsWith(realRoot + path.sep)) return { ok: false, status: 403 };
    if (!statSync(real).isFile()) return { ok: false, status: 404 };
    return { ok: true, fullPath: real };
  } catch { return { ok: false, status: 404 }; }
}

function handleTree(sources: Source[]): Response {
  return Response.json({
    sources: sources.map(s => {
      const files = scanDir(s.realRoot, s.realRoot, s.realRoot).sort((a, b) => a.path.localeCompare(b.path));
      return { name: s.name, files: files.map(f => ({ path: f.path, title: f.title })) };
    }),
  });
}

function handleDoc(sources: Source[], url: URL): Response {
  const sourceName = url.searchParams.get("source"), reqPath = url.searchParams.get("path");
  if (!sourceName || !reqPath) return new Response("Missing parameters", { status: 404 });
  const src = sources.find(s => s.name === sourceName);
  if (!src || !reqPath.endsWith(".md")) return new Response("Not found", { status: 404 });
  const safe = resolveSafeDoc(src.realRoot, reqPath);
  if (!safe.ok) return new Response("Forbidden or missing", { status: safe.status });
  try {
    const content = readFileSync(safe.fullPath, "utf-8");
    return Response.json({
      source: src.name, path: reqPath,
      title: getTitle(content, path.basename(safe.fullPath)),
      markdown: content, mtime: statSync(safe.fullPath).mtimeMs,
    });
  } catch { return new Response("Not found", { status: 404 }); }
}

function handleSearch(sources: Source[], url: URL): Response {
  const q = url.searchParams.get("q");
  if (!q || !q.trim()) return Response.json({ results: [] });
  const needle = q.toLowerCase(), titles: SearchResult[] = [], content: SearchResult[] = [];
  for (const src of sources) {
    for (const f of scanDir(src.realRoot, src.realRoot, src.realRoot)) {
      if (f.title.toLowerCase().includes(needle)) {
        titles.push({ source: src.name, path: f.path, title: f.title, line: 0, snippet: f.title });
      }
      try {
        const lines = readFileSync(f.fullPath, "utf-8").split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            content.push({ source: src.name, path: f.path, title: f.title, line: i + 1, snippet: makeSnippet(lines[i], needle) });
          }
        }
      } catch {}
    }
  }
  return Response.json({ results: [...titles, ...content].slice(0, 50) });
}

function broadcast(clients: Set<ReadableStreamDefaultController>, chunk: Uint8Array): void {
  for (const c of clients) {
    try { c.enqueue(chunk); } catch { clients.delete(c); }
  }
}

function handleEvents(clients: Set<ReadableStreamDefaultController>): Response {
  let ctrl: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(c) {
      ctrl = c;
      clients.add(c);
      try { c.enqueue(new TextEncoder().encode(": connected\n\n")); } catch { clients.delete(c); }
    },
    cancel() { clients.delete(ctrl); },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "connection": "keep-alive" },
  });
}

function handleStatic(url: URL, webDir: string): Response {
  let reqPath = decodeURIComponent(url.pathname);
  if (reqPath === "/") reqPath = "/index.html";
  let realWeb: string;
  try { realWeb = realpathSync(webDir); } catch { realWeb = path.resolve(webDir); }
  const target = path.resolve(realWeb, "." + reqPath);
  if (!target.startsWith(realWeb + path.sep) && target !== realWeb) return new Response("Not found", { status: 404 });
  const ext = path.extname(target), mime = MIME[ext];
  if (!mime) return new Response("Not found", { status: 404 });
  if (reqPath === "/index.html" && !existsSync(target)) {
    return new Response("<!doctype html><html><head><title>docs</title></head><body></body></html>", { headers: { "content-type": mime } });
  }
  if (!existsSync(target)) return new Response("Not found", { status: 404 });
  try {
    if (!statSync(target).isFile()) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(target), { headers: { "content-type": mime } });
  } catch { return new Response("Not found", { status: 404 }); }
}

function parseArgs(argv: string[]): { port: number; host: string; sources: Source[]; noOpen: boolean } {
  let port = 4400, host = "127.0.0.1", noOpen = false;
  const rawSources: Array<{ name: string; rawDir: string }> = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" && i + 1 < argv.length) port = parseInt(argv[++i], 10) || port;
    else if (arg === "--host" && i + 1 < argv.length) host = argv[++i];
    else if (arg === "--source" && i + 1 < argv.length) {
      const val = argv[++i], eq = val.indexOf("=");
      if (eq > 0) rawSources.push({ name: val.slice(0, eq), rawDir: val.slice(eq + 1) });
    } else if (arg === "--no-open") noOpen = true;
  }
  if (rawSources.length === 0) {
    const home = process.env.HOME || "";
    rawSources.push({ name: "brain", rawDir: path.join(home, "brain") }, { name: "dotfiles", rawDir: path.join(home, ".dotfiles") });
  }
  const sources: Source[] = rawSources.map(({ name, rawDir }) => {
    const exp = rawDir.startsWith("~/") ? path.join(process.env.HOME || "", rawDir.slice(2)) : rawDir;
    const abs = path.resolve(exp);
    let real = abs;
    try { if (existsSync(abs)) real = realpathSync(abs); } catch {}
    return { name, root: abs, realRoot: real };
  });
  return { port, host, sources, noOpen };
}

function startServer() {
  const { port, host, sources, noOpen } = parseArgs(process.argv.slice(2));
  const clients = new Set<ReadableStreamDefaultController>(), webDir = path.join(import.meta.dir, "web");
  const ping = new TextEncoder().encode(": ping\n\n");

  setInterval(() => broadcast(clients, ping), 15000).unref();

  for (const s of sources) {
    if (!existsSync(s.realRoot)) continue;
    try {
      watch(s.realRoot, { recursive: true }, (_, fn) => {
        if (!fn || !fn.endsWith(".md")) return;
        const norm = fn.split(path.sep).join("/").replace(/^\/+/, "");
        if (norm.split("/").some(p => p.startsWith(".") || p === "node_modules")) return;
        const msg = new TextEncoder().encode(`event: change\ndata: ${JSON.stringify({ source: s.name, path: norm })}\n\n`);
        broadcast(clients, msg);
      });
    } catch {}
  }

  const server = Bun.serve({
    port, hostname: host, idleTimeout: 0,
    fetch(req) {
      const url = new URL(req.url), p = url.pathname;
      if (p === "/api/tree") return handleTree(sources);
      if (p === "/api/doc") return handleDoc(sources, url);
      if (p === "/api/search") return handleSearch(sources, url);
      if (p === "/api/events") return handleEvents(clients);
      return p.startsWith("/api/") ? new Response("Not found", { status: 404 }) : handleStatic(url, webDir);
    },
  });

  console.log(`docs listening on http://${host}:${server.port}`);
  if (!noOpen) {
    try { Bun.spawn(["open", `http://${host}:${server.port}`]); } catch {}
  }
}

startServer();
