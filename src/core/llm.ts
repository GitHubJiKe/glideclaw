import type { ChatMessage } from "../types/chat";
import { estimateTokensFromMessages } from "../utils/tokens";

export type LlmOptions = {
  apiKey: string;
  baseUrl: string; // e.g. https://api.openai.com/v1
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
};

export type StreamChatParams = {
  messages: ChatMessage[];
};

type ChatCompletionsChunk = {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function* sseToJsonChunks(resp: Response): AsyncGenerator<any> {
  if (!resp.body) throw new Error("响应体为空，无法进行流式读取。");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const findBoundary = (s: string): { idx: number; len: number } | null => {
    const lf = s.indexOf("\n\n");
    const crlf = s.indexOf("\r\n\r\n");
    if (lf === -1 && crlf === -1) return null;
    if (lf !== -1 && (crlf === -1 || lf < crlf)) return { idx: lf, len: 2 };
    return { idx: crlf, len: 4 };
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE 以空行分隔事件
    while (true) {
      const boundary = findBoundary(buf);
      if (!boundary) break;
      const rawEvent = buf.slice(0, boundary.idx);
      buf = buf.slice(boundary.idx + boundary.len);

      const lines = rawEvent
        .replaceAll("\r\n", "\n")
        .split("\n")
        .map((l) => l.trimEnd())
        .filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice("data:".length).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data);
        } catch {
          // 忽略无法解析的片段（兼容某些代理/网关）
        }
      }
    }
  }
}

export async function* streamChat(
  opts: LlmOptions,
  params: StreamChatParams,
): AsyncGenerator<string> {
  const estimated = estimateTokensFromMessages(params.messages);
  const maxTokens = opts.maxTokens;

  // 仅做预估提示；真正上限由服务端控制
  if (maxTokens && estimated > maxTokens) {
    throw new Error(
      `上下文预估 token(${estimated}) 超过 MAX_TOKENS(${maxTokens})，请减少窗口天数或缩短输入。`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);

  const url = joinUrl(opts.baseUrl, "/chat/completions");
  const resp = await fetch(url, {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: params.messages,
      stream: true,
      max_tokens: opts.maxTokens,
    }),
  }).finally(() => clearTimeout(timeout));

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`LLM 请求失败：HTTP ${resp.status} ${resp.statusText}\n${text}`);
  }

  for await (const evt of sseToJsonChunks(resp)) {
    const chunk = evt as ChatCompletionsChunk;
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function streamChatToStdout(
  opts: LlmOptions,
  params: StreamChatParams,
): Promise<string> {
  let full = "";
  for await (const part of streamChat(opts, params)) {
    full += part;
    process.stdout.write(part);
  }
  return full;
}

