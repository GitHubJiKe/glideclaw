import { test, expect, afterEach } from "bun:test";
import { loadConfig } from "../src/core/config";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("config: WINDOW_DAYS=31 应触发 zod 校验错误", async () => {
  process.env.API_KEY = "test-key";
  process.env.WINDOW_DAYS = "31";

  await expect(loadConfig()).rejects.toThrow();
});

