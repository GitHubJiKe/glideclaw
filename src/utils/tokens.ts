import type { ChatMessage } from "../types/chat";

// 轻量预估：英文约 4 chars / token；中文通常更“密”，这里依旧做保守估计
export function estimateTokensFromText(text: string): number {
  const normalized = text ?? "";
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function estimateTokensFromMessages(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokensFromText(m.content), 0);
}

