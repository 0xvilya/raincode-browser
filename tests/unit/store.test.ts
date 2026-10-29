import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserStore } from "../../src/main/store";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function storagePath() {
  const directory = mkdtempSync(path.join(tmpdir(), "raincode-store-test-"));
  directories.push(directory);
  return path.join(directory, "browser.sqlite");
}

describe("durable local browser state", () => {
  it("returns defaults for missing keys and survives reopen", async () => {
    const filename = storagePath();
    const first = new BrowserStore(filename);
    expect(await first.get("missing", { enabled: false })).toEqual({
      enabled: false,
    });
    const values = {
      history: [
        {
          id: "h1",
          url: "https://example.com",
          title: "Example",
          visitedAt: 123,
          profileId: "default",
        },
      ],
      bookmarks: [
        {
          id: "b1",
          url: "https://example.com",
          title: "Example",
          createdAt: 123,
        },
      ],
      session: [
        { url: "https://example.com", profileId: "default", pinned: true },
      ],
      settings: { historyEnabled: false, rain: "off" },
    };
    try {
      for (const [key, value] of Object.entries(values))
        await first.set(key, value);
    } finally {
      first.close();
    }
    const second = new BrowserStore(filename);
    try {
      for (const [key, value] of Object.entries(values))
        expect(await second.get(key, null)).toEqual(value);
    } finally {
      second.close();
    }
  });

  it("replaces a value atomically and treats SQL punctuation as data", async () => {
    const store = new BrowserStore(storagePath());
    const key = "notes'; DROP TABLE settings; --";
    try {
      await store.set(key, { value: "first" });
      await store.set(key, {
        value: "Привет 🌧️",
        code: "console.log('hello');",
      });
      expect(await store.get(key, null)).toEqual({
        value: "Привет 🌧️",
        code: "console.log('hello');",
      });
      await store.set("survived", 1);
      expect(await store.get("survived", 0)).toBe(1);
    } finally {
      store.close();
    }
  });
});
