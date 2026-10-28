// API contract for server.ts (see README.md). Starts the real server against fixtures/.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 4500 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${port}`;
const work = mkdtempSync(join(tmpdir(), "docs-test-"));
let server: ReturnType<typeof Bun.spawn>;

const get = (path: string) => fetch(base + path);
const json = async (path: string) => (await get(path)).json();

beforeAll(async () => {
  cpSync(join(import.meta.dir, "fixtures"), work, { recursive: true });
  symlinkSync("/etc", join(work, "alpha", "escape"));
  server = Bun.spawn(
    ["bun", join(import.meta.dir, "server.ts"), "--port", String(port),
      "--source", `alpha=${join(work, "alpha")}`, "--source", `beta=${join(work, "beta")}`, "--no-open"],
    { stdout: "inherit", stderr: "inherit" },
  );
  for (let i = 0; i < 50; i++) {
    try { if ((await get("/api/tree")).ok) return; } catch {}
    await Bun.sleep(100);
  }
  throw new Error("server did not start");
});

afterAll(() => {
  server?.kill();
  rmSync(work, { recursive: true, force: true });
});

describe("GET /api/tree", () => {
  test("lists only markdown, sorted, with titles", async () => {
    const { sources } = await json("/api/tree");
    expect(sources.map((s: any) => s.name)).toEqual(["alpha", "beta"]);
    expect(sources[0].files).toEqual([
      { path: "guide.md", title: "Alpha Guide" },
      { path: "notes/setup.md", title: "Setup Notes" },
    ]);
    expect(sources[1].files).toEqual([
      { path: "beta-reference.md", title: "Beta Reference" },
      { path: "code-title.md", title: "The `qa` Tool" },
      { path: "untitled-note.md", title: "untitled-note" },
    ]);
  });
});

describe("GET /api/doc", () => {
  test("returns markdown, title and mtime", async () => {
    const doc = await json("/api/doc?source=alpha&path=notes/setup.md");
    expect(doc.source).toBe("alpha");
    expect(doc.path).toBe("notes/setup.md");
    expect(doc.title).toBe("Setup Notes");
    expect(doc.markdown).toContain("const answer = 42;");
    expect(typeof doc.mtime).toBe("number");
  });

  test.each([
    ["/api/doc?source=nope&path=guide.md", 404],
    ["/api/doc?source=alpha&path=missing.md", 404],
    ["/api/doc?source=beta&path=ignore.txt", 404],
    ["/api/doc?source=alpha&path=../beta/beta-reference.md", 403],
    ["/api/doc?source=alpha&path=/etc/hosts.md", 403],
    ["/api/doc?source=alpha&path=escape/hosts.md", 403],
  ])("%s → %d", async (path, status) => {
    expect((await get(path)).status).toBe(status);
  });
});

describe("GET /api/search", () => {
  test("title matches come first, content matches carry line + snippet", async () => {
    const { results } = await json("/api/search?q=beta");
    expect(results[0]).toMatchObject({ source: "beta", path: "beta-reference.md", title: "Beta Reference", line: 0 });
    const content = (await json("/api/search?q=ZEBRA-quartz")).results;
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({ source: "alpha", path: "guide.md", line: 101 });
    expect(content[0].snippet).toContain("zebra-quartz");
    expect(content[0].snippet.length).toBeLessThanOrEqual(160);
  });

  test("empty query returns nothing", async () => {
    expect(await json("/api/search?q=")).toEqual({ results: [] });
  });
});

describe("GET /api/events", () => {
  test("emits change for an edited markdown file", async () => {
    const res = await get("/api/events");
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    await Bun.sleep(300);
    writeFileSync(join(work, "beta", "beta-reference.md"), "# Beta Reference\n\nedited\n");
    let text = "";
    const deadline = Date.now() + 5000;
    while (!text.includes("beta-reference.md") && Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        Bun.sleep(deadline - Date.now()).then(() => ({ value: undefined, done: true })),
      ]);
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    reader.cancel();
    expect(text).toContain("event: change");
    expect(text).toContain('"source":"beta"');
    expect(text).toContain('"path":"beta-reference.md"');
  });
});

describe("static", () => {
  test("serves index.html and vendor files, 404 otherwise", async () => {
    expect((await get("/")).headers.get("content-type")).toContain("text/html");
    expect((await get("/vendor/marked.esm.js")).status).toBe(200);
    expect((await get("/nope.js")).status).toBe(404);
    expect((await get("/../server.ts")).status).toBe(404);
  });
});
