import { Injectable } from '@nestjs/common';
import { type DailyMomentChatMessage, type DailyMomentSnippet } from './daily-moment.types';

interface RankedSnippet {
  snippet: DailyMomentSnippet;
  score: number;
}

@Injectable()
export class DailyMomentSnippetExtractor {
  private readonly minMessages = 3;
  private readonly maxMessages = 16;

  extractCandidates(
    conversationId: string,
    recentMessages: DailyMomentChatMessage[],
    maxCandidates = 3,
  ): DailyMomentSnippet[] {
    const base = recentMessages
      .filter((m) => m.content.trim().length > 0)
      .slice(-this.maxMessages);

    if (base.length === 0) return [];

    const windows: RankedSnippet[] = [];
    const minWindow = Math.min(this.minMessages, base.length);
    const maxWindow = Math.min(this.maxMessages, base.length);

    // 固定以“最近消息”为终点，枚举不同窗口长度，确保聚焦“今天这一小段”。
    for (let size = minWindow; size <= maxWindow; size += 1) {
      const segment = base.slice(base.length - size);
      const snippet = this.buildSnippet(conversationId, segment);
      windows.push({ snippet, score: this.scoreSnippet(segment) });
    }

    return windows
      .sort((a, b) => b.score - a.score)
      .map((x) => x.snippet)
      .filter((s, idx, arr) => idx === arr.findIndex((v) => v.id === s.id))
      .slice(0, maxCandidates);
  }

  pickPrimarySnippet(
    conversationId: string,
    recentMessages: DailyMomentChatMessage[],
  ): DailyMomentSnippet {
    const candidates = this.extractCandidates(conversationId, recentMessages, 1);
    if (candidates[0]) return candidates[0];

    const fallback = recentMessages.slice(-Math.min(4, recentMessages.length));
    return this.buildSnippet(conversationId, fallback);
  }

  private buildSnippet(
    conversationId: string,
    messages: DailyMomentChatMessage[],
  ): DailyMomentSnippet {
    const clean = messages.slice(-this.maxMessages);
    const first = clean[0];
    const last = clean[clean.length - 1];
    const summaryHint = this.buildSummaryHint(clean);

    return {
      id: `${first?.id ?? 'none'}:${last?.id ?? 'none'}`,
      conversationId,
      messageIds: clean.map((m) => m.id),
      messages: clean,
      summaryHint,
      turnCount: clean.length,
    };
  }

  private buildSummaryHint(messages: DailyMomentChatMessage[]): string {
    const userLast = [...messages].reverse().find((m) => m.role === 'user')?.content.trim() ?? '';
    const assistantLast =
      [...messages].reverse().find((m) => m.role === 'assistant')?.content.trim() ?? '';

    const pair = [userLast, assistantLast].filter(Boolean).join(' / ');
    return pair.slice(0, 90);
  }

  private scoreSnippet(messages: DailyMomentChatMessage[]): number {
    if (messages.length === 0) return 0;
    const alternation = this.scoreAlternation(messages);
    const hasBothRoles =
      messages.some((m) => m.role === 'user') && messages.some((m) => m.role === 'assistant') ? 1 : 0;
    const text = messages.map((m) => m.content).join('\n');
    const pivot = /(本来|结果|后来|但是|反而|那就好|好吧)/.test(text) ? 1 : 0;
    const mood = /(哈哈|逗|可爱|轻松|接住|安心|好玩)/.test(text) ? 1 : 0;
    return alternation * 0.35 + hasBothRoles * 0.25 + pivot * 0.2 + mood * 0.2;
  }

  private scoreAlternation(messages: DailyMomentChatMessage[]): number {
    if (messages.length <= 1) return 0;
    let changed = 0;
    for (let i = 1; i < messages.length; i += 1) {
      if (messages[i].role !== messages[i - 1].role) changed += 1;
    }
    return changed / (messages.length - 1);
  }
}
