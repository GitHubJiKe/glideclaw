import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/core/memory";
import { streamChatToStdout } from "../src/core/llm";

test("llm: 网络异常时应抛错且已保存用户消息", async () => {
  const dir = mkdtempSync(join(tmpdir(), "glideclaw-test-"));
  const dbPath = join(dir, "glideclaw.sqlite");

  const store = new MemoryStore({ dbPath });
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      throw new Error("network down");
    };

    store.saveMessage("user", "hello");

    await expect(
      streamChatToStdout(
        { apiKey: "x", baseUrl: "https://example.com", model: "gpt-4o-mini" },
        { messages: [{ role: "user", content: "hello" }] },
      ),
    ).rejects.toThrow("network down");

    const history = store.getHistory();
    expect(history.some((m) => m.role === "user" && m.content === "hello")).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

