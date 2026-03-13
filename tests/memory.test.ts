import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/core/memory";

let dir = "";
let dbPath = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "glideclaw-test-"));
  dbPath = join(dir, "glideclaw.sqlite");
});

afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

test("memory: 插入 10 天前数据，窗口 7 天应被清理", () => {
  const store = new MemoryStore({ dbPath });
  try {
    store.saveMessage("user", "old", { timestamp: "2000-01-01 00:00:00" });
    const ctx = store.getContext(7);
    expect(ctx.length).toBe(0);
  } finally {
    store.close();
  }
});

test("memory: 插入后数据库文件应存在于磁盘", async () => {
  const store = new MemoryStore({ dbPath });
  try {
    store.saveMessage("user", "hi");
  } finally {
    store.close();
  }

  const file = Bun.file(dbPath);
  expect(await file.exists()).toBe(true);
});

