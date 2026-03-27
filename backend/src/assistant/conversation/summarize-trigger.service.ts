import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { SummarizerService } from '../summarizer/summarizer.service';
import { PersonaService } from '../persona/persona.service';
import { EvolutionSchedulerService } from '../persona/evolution-scheduler.service';
import { FeatureFlagConfig } from './feature-flag.config';
import type { MemoryOp, ClaimOp } from '../cognitive-trace/cognitive-trace.types';

export interface SummarizeTriggerOpsResult {
  memoryOps: MemoryOp[];
  claimOps: ClaimOp[];
}

@Injectable()
export class SummarizeTriggerService {
  private static readonly INSTANT_SUMMARIZE_RE =
    /(?:记住|记一下|别忘|请你记|帮我记|我叫|我姓|我是(?!说|不是|在说)|我今年|我住在|我在(?!说|想|看)|我换了|我的名字)/;

  private readonly logger = new Logger(SummarizeTriggerService.name);
  private readonly summarizingConversations = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly summarizer: SummarizerService,
    private readonly persona: PersonaService,
    private readonly evolutionScheduler: EvolutionSchedulerService,
    private readonly flags: FeatureFlagConfig,
  ) {}

  async maybeAutoSummarize(
    conversationId: string,
    userInput: string,
    userId: string,
  ): Promise<SummarizeTriggerOpsResult> {
    const empty: SummarizeTriggerOpsResult = { memoryOps: [], claimOps: [] };
    if (this.summarizingConversations.has(conversationId)) return empty;

    const useInstant = this.flags.featureInstantSummarize
      && SummarizeTriggerService.INSTANT_SUMMARIZE_RE.test(userInput);
    if (useInstant) {
      return this.summarizeDelta(conversationId, userInput.slice(0, 30), userId);
    }

    if (!this.flags.featureAutoSummarize) return empty;

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { summarizedAt: true },
    });
    if (!conv) return empty;

    const newUserMessages = await this.prisma.message.count({
      where: {
        conversationId,
        role: 'user',
        ...(conv.summarizedAt ? { createdAt: { gt: conv.summarizedAt } } : {}),
      },
    });

    if (newUserMessages < this.flags.autoSummarizeThreshold) return empty;
    return this.summarizeDelta(conversationId, `threshold:${newUserMessages}`, userId);
  }

  async flushSummarize(conversationId: string, userId: string): Promise<{ flushed: boolean }> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { summarizedAt: true },
    });
    if (!conv) return { flushed: false };

    const unsummarizedCount = await this.prisma.message.count({
      where: {
        conversationId,
        role: 'user',
        ...(conv.summarizedAt ? { createdAt: { gt: conv.summarizedAt } } : {}),
      },
    });
    if (unsummarizedCount < 5) return { flushed: false };

    this.summarizeDelta(conversationId, `flush:${unsummarizedCount}`, userId).catch((err: Error) =>
      this.logger.warn(`Flush-summarize failed: ${err.message}`),
    );

    return { flushed: true };
  }

  private async summarizeDelta(
    conversationId: string,
    reason: string,
    userId: string,
  ): Promise<SummarizeTriggerOpsResult> {
    const empty: SummarizeTriggerOpsResult = { memoryOps: [], claimOps: [] };
    if (this.summarizingConversations.has(conversationId)) return empty;
    this.summarizingConversations.add(conversationId);

    try {
      this.logger.log(`Summarize triggered for ${conversationId}: ${reason}`);
      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { summarizedAt: true },
      });
      if (!conv) return empty;

      const newMessageIds = conv.summarizedAt
        ? (await this.prisma.message.findMany({
            where: { conversationId, createdAt: { gt: conv.summarizedAt } },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          })).map((m) => m.id)
        : undefined;

      const result = await this.summarizer.summarize(conversationId, userId, newMessageIds);
      if (result.created > 0) {
        await this.triggerAutoEvolution(conversationId, userId);
      }

      return this.extractOps(result);
    } finally {
      this.summarizingConversations.delete(conversationId);
    }
  }

  private extractOps(result: Awaited<ReturnType<SummarizerService['summarize']>>): SummarizeTriggerOpsResult {
    const memoryOps: MemoryOp[] = result.memories.map((m) => ({
      action: 'write' as const,
      memoryId: m.id,
      category: m.category,
      content: m.content,
    }));

    const claimOps: ClaimOp[] = (result.claimResults ?? [])
      .filter((c) => c.previousStatus && c.previousStatus !== c.status)
      .map((c) => ({
        action: 'promote' as const,
        claimId: c.claimId,
        fromStatus: c.previousStatus,
        toStatus: c.status,
      }));

    return { memoryOps, claimOps };
  }

  private async triggerAutoEvolution(conversationId: string, userId: string): Promise<void> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (messages.length === 0) return;

    const recent = messages.reverse().map((m) => ({ role: m.role, content: m.content }));
    const result = await this.persona.suggestEvolution(recent);
    if (result.changes.length === 0) return;

    const isUserPref = (field: string) =>
      field === 'preferredVoiceStyle' || field === 'praisePreference' || field === 'responseRhythm';

    const preferenceChanges = result.changes.filter((c) => isUserPref(c.targetField ?? c.field));
    const personaChanges = result.changes.filter((c) => !isUserPref(c.targetField ?? c.field));

    if (preferenceChanges.length > 0) {
      await this.persona.confirmEvolution(preferenceChanges);
    }

    if (personaChanges.length === 0) return;
    this.evolutionScheduler.setPendingSuggestion(userId, {
      changes: personaChanges,
      triggerReason: '自动总结后触发',
      createdAt: new Date(),
    });
  }
}
