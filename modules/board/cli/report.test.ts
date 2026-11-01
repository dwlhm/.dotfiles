import { expect, test } from "bun:test";
import { formatDetail, parseReport } from "./report";

test("free text: a question buried after a plan becomes the headline; 1) lists render as lists", () => {
  const r = parseReport("question", "Rencana T3 (mohon approve):\n1) ui.js: helper\n2) card.js: tag\nCatatan: T2 edits compose.js.\nSetuju?", 5);
  expect(r.headline).toBe("Setuju?");
  expect(r.detail).toBe("Rencana T3 (mohon approve):\n\n1. ui.js: helper\n2. card.js: tag\n\nCatatan: T2 edits compose.js.");
});

test("headline is plain text from the first line; a lone question line stays", () => {
  expect(parseReport("done", "## **Fixed the toggle**\nVerified: bun test", 1)).toMatchObject({ headline: "Fixed the toggle", detail: "Verified: bun test" });
  expect(parseReport("question", "Which colour?", 1)).toMatchObject({ headline: "Which colour?", detail: "", options: [] });
  expect(() => parseReport("done", "  \n ", 1)).toThrow("needs a summary");
});

test("formatDetail keeps code fences, nested items and blank lines as typed", () => {
  expect(formatDetail("Run:\n```\na\nb\n```\n- x\n  - y\n\n\n\nend")).toBe("Run:\n\n```\na\nb\n```\n\n- x\n  - y\n\nend");
});

test("a long one-line note: first sentence leads, inline 1) 2) steps become a list", () => {
  const r = parseReport("done", "Popup New task fixed (not committed). 1) Fields scroll, buttons pinned. 2) Folder is a real Input. Verified: bun test 12/12, herdr-app check passed, bundle ok.", 1);
  expect(r.headline).toBe("Popup New task fixed (not committed).");
  expect(r.detail).toBe("1. Fields scroll, buttons pinned.\n2. Folder is a real Input. Verified: bun test 12/12, herdr-app check passed, bundle ok.");
});
