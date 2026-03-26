import type { LoggerService } from '@nestjs/common';

/**
 * Lightweight token estimator (no external dependency).
 * Approximation: ~4 chars per token for mixed CJK/English text.
 */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.role) + estimateTokens(m.content) + 4;
  }
  return total + 2;
}

export function assertTokenBudget(
  content: string | null | undefined,
  budgetTokens: number,
  blockName: string,
  logger: LoggerService,
): string | null {
  if (!content?.trim()) return null;
  const estimated = estimateTokens(content);
  if (estimated > budgetTokens) {
    logger.warn(
      `[PromptRouter] Block "${blockName}" exceeds budget: ${estimated}/${budgetTokens} tokens`,
    );
  }
  return content;
}

/**
 * Truncate message history to fit within a token budget.
 * Keeps the system message (first) and trims oldest user/assistant pairs.
 */
export function truncateToTokenBudget(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Array<{ role: string; content: string }> {
  if (estimateMessagesTokens(messages) <= maxTokens) return messages;

  const result = [...messages];
  while (result.length > 1 && estimateMessagesTokens(result) > maxTokens) {
    result.splice(1, 1);
  }
  return result;
}
