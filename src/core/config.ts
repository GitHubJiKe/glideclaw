import { z } from "zod";

const RcSchema = z
  .object({
    API_KEY: z.string().min(1).optional(),
    MODEL: z.string().min(1).optional(),
    WINDOW_DAYS: z.coerce.number().int().min(1).max(30).optional(),
    MAX_TOKENS: z.coerce.number().int().min(1).optional(),
    BASE_URL: z.string().min(1).optional(),
    DB_PATH: z.string().min(1).optional(),
  })
  .strict()
  .partial();

export type AppConfig = {
  apiKey: string;
  model: string;
  windowDays: number;
  maxTokens?: number;
  baseUrl: string;
  dbPath: string;
  rcPath?: string;
};

function resolveHomeDir(): string | undefined {
  return Bun.env.HOME ?? process.env.HOME ?? process.env.USERPROFILE;
}

export function defaultRcPath(): string | undefined {
  const home = resolveHomeDir();
  if (!home) return undefined;
  return `${home}/.glideclawrc`;
}

export async function readRcFile(rcPath: string): Promise<unknown | undefined> {
  const file = Bun.file(rcPath);
  if (!(await file.exists())) return undefined;
  const text = await file.text();
  if (!text.trim()) return undefined;
  return JSON.parse(text);
}

export async function writeRcFile(rcPath: string, data: unknown): Promise<void> {
  const file = Bun.file(rcPath);
  await Bun.write(file, `${JSON.stringify(data, null, 2)}\n`);
}

export async function updateRcFile(
  rcPath: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const current = (await readRcFile(rcPath)) ?? {};
  const merged =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>), ...patch }
      : { ...patch };
  RcSchema.parse(merged);
  await writeRcFile(rcPath, merged);
}

export async function loadConfig(): Promise<AppConfig> {
  const rcPath = defaultRcPath();
  const rcRaw = rcPath ? await readRcFile(rcPath) : undefined;

  const rc = rcRaw ? RcSchema.parse(rcRaw) : {};

  const apiKey = (Bun.env.API_KEY ?? rc.API_KEY)?.trim();
  if (!apiKey) {
    throw new Error(
      "缺少 API_KEY：请设置环境变量 API_KEY 或在 ~/.glideclawrc 中配置 {\"API_KEY\": \"...\"}。",
    );
  }

  const model = (Bun.env.MODEL ?? rc.MODEL ?? "gpt-4o-mini").trim();
  const windowDays = Number(Bun.env.WINDOW_DAYS ?? rc.WINDOW_DAYS ?? 7);

  const parsedWindowDays = z.number().int().min(1).max(30).parse(windowDays);

  const maxTokensEnvOrRc = Bun.env.MAX_TOKENS ?? (rc.MAX_TOKENS as any);
  const maxTokens =
    maxTokensEnvOrRc === undefined || maxTokensEnvOrRc === null
      ? undefined
      : z.coerce.number().int().min(1).parse(maxTokensEnvOrRc);

  const baseUrl = (Bun.env.BASE_URL ?? rc.BASE_URL ?? "https://api.openai.com/v1")
    .trim()
    .replace(/\/+$/, "");

  const dbPath = (Bun.env.DB_PATH ?? rc.DB_PATH ?? "db/glideclaw.sqlite").trim();

  return {
    apiKey,
    model,
    windowDays: parsedWindowDays,
    maxTokens,
    baseUrl,
    dbPath,
    rcPath,
  };
}

