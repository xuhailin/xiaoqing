import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import { estimateTokens } from '../../infra/token-estimator';
import { WorldStateService } from '../../infra/world-state/world-state.service';
import type { WorldStateUpdate } from '../../infra/world-state/world-state.types';
import { DailyMomentService } from '../life-record/daily-moment/daily-moment.service';
import { CognitiveGrowthService } from '../cognitive-pipeline/cognitive-growth.service';
import { AssistantOrchestrator } from './assistant-orchestrator.service';
import type { ConversationMessageDto, SendMessageResult } from './orchestration.types';
import { FeatureFlagConfig } from './feature-flag.config';
import { SummarizeTriggerService } from './summarize-trigger.service';
import { toConversationMessageDto } from './message.dto';
import { DEFAULT_ENTRY_AGENT_ID, type EntryAgentId } from '../../gateway/message-router.types';

type ConversationWithCount = Prisma.ConversationGetPayload<{
  include: {
    _count: { select: { messages: true } };
    messages: {
      orderBy: { createdAt: 'desc' };
      take: 1;
    };
  };
}>;

@Injectable()
export class ConversationService {
  private readonly lastNRounds: number;
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worldState: WorldStateService,
    private readonly dailyMoment: DailyMomentService,
    private readonly cognitiveGrowth: CognitiveGrowthService,
    private readonly assistantOrchestrator: AssistantOrchestrator,
    private readonly summarizeTrigger: SummarizeTriggerService,
    flags: FeatureFlagConfig,
  ) {
    this.lastNRounds = flags.lastNRounds;
  }

  async list() {
    const reminderGroups = await this.prisma.plan.groupBy({
      by: ['conversationId'],
      where: {
        scope: 'chat',
        status: 'active',
        conversationId: { not: null },
      },
      _count: { conversationId: true },
    });
    const reminderCountMap = new Map(
      reminderGroups
        .filter((item) => !!item.conversationId)
        .map((item) => [item.conversationId!, item._count.conversationId]),
    );

    const conversations: ConversationWithCount[] = await this.prisma.conversation.findMany({
      where: { isInternal: false },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      entryAgentId: c.entryAgentId,
      summarizedAt: c.summarizedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
      activeReminderCount: reminderCountMap.get(c.id) ?? 0,
      latestMessage: c.messages[0] ? toConversationMessageDto(c.messages[0]) : null,
    }));
  }

  async create(
    entryAgentId: EntryAgentId = DEFAULT_ENTRY_AGENT_ID,
  ): Promise<{ id: string; entryAgentId: EntryAgentId }> {
    const c = await this.prisma.conversation.create({
      data: { entryAgentId },
    });
    return { id: c.id, entryAgentId: c.entryAgentId as EntryAgentId };
  }

  async getOrCreateCurrent(
    entryAgentId: EntryAgentId = DEFAULT_ENTRY_AGENT_ID,
  ): Promise<{ id: string; entryAgentId: EntryAgentId }> {
    const latest = await this.prisma.conversation.findFirst({
      where: { entryAgentId, isInternal: false },
      orderBy: { createdAt: 'desc' },
    });
    if (latest) return { id: latest.id, entryAgentId: latest.entryAgentId as EntryAgentId };
    return this.create(entryAgentId);
  }

  async delete(conversationId: string): Promise<{
    deletedMemories: number;
    growthCleanup: {
      archivedProfiles: number;
      weakenedProfiles: number;
      archivedRelationships: number;
      weakenedRelationships: number;
      deletedBoundaryEvents: number;
      weakenedBoundaryEvents: number;
    };
  }> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      select: { id: true },
    });
    const messageIds = messages.map((m) => m.id);

    let deletedMemories = 0;
    if (messageIds.length > 0) {
      const { count } = await this.prisma.memory.deleteMany({
        where: { sourceMessageIds: { hasSome: messageIds } },
      });
      deletedMemories = count;
    }

    const growthCleanup = await this.cognitiveGrowth.cleanupGrowthForDeletedMessages(messageIds);

    await this.prisma.conversation.delete({ where: { id: conversationId } });

    this.logger.log(
      `Deleted conversation ${conversationId}, ${messageIds.length} messages, ${deletedMemories} memories, ` +
      `growthCleanup=${JSON.stringify(growthCleanup)}`,
    );
    return { deletedMemories, growthCleanup };
  }

  async getMessages(conversationId: string): Promise<ConversationMessageDto[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    return messages.map(toConversationMessageDto);
  }

  async listDailyMoments(conversationId: string) {
    return this.dailyMoment.listRecords(conversationId);
  }

  async saveDailyMomentFeedback(
    conversationId: string,
    recordId: string,
    feedback: 'like' | 'neutral' | 'awkward' | 'ignored',
  ) {
    await this.dailyMoment.saveFeedback(conversationId, recordId, feedback);
    return { ok: true };
  }

  async getLastNMessages(conversationId: string): Promise<
    Array<{ role: string; content: string }>
  > {
    const all = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: this.lastNRounds * 2,
    });
    return all.reverse().map((m) => ({ role: m.role, content: m.content }));
  }

  async getWorldState(conversationId: string) {
    return this.worldState.get(conversationId);
  }

  async updateWorldState(conversationId: string, update: WorldStateUpdate) {
    await this.worldState.update(conversationId, update);
    return this.worldState.get(conversationId);
  }

  async getTokenStats(conversationId: string) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      select: { role: true, tokenCount: true },
    });
    let userTokens = 0;
    let assistantTokens = 0;
    for (const m of messages) {
      const count = m.tokenCount ?? 0;
      if (m.role === 'user') userTokens += count;
      else assistantTokens += count;
    }
    return {
      totalMessages: messages.length,
      userTokens,
      assistantTokens,
      totalTokens: userTokens + assistantTokens,
    };
  }

  async sendMessage(
    conversationId: string,
    content: string,
  ): Promise<SendMessageResult> {
    const userMsg = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        kind: 'user',
        content,
        tokenCount: estimateTokens(content),
      },
    });
    return this.assistantOrchestrator.processTurn({
      conversationId,
      userInput: content,
      userMessage: {
        id: userMsg.id,
        role: 'user',
        content: userMsg.content,
        createdAt: userMsg.createdAt,
      },
      recentRounds: this.lastNRounds,
    });
  }

  async sendDelegatedMessage(input: {
    conversationId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<SendMessageResult> {
    const userMsg = await this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: 'user',
        kind: 'user',
        content: input.content,
        ...(input.metadata
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
        tokenCount: estimateTokens(input.content),
      },
    });

    return this.assistantOrchestrator.processTurn({
      conversationId: input.conversationId,
      userInput: input.content,
      userMessage: {
        id: userMsg.id,
        role: 'user',
        content: userMsg.content,
        createdAt: userMsg.createdAt,
      },
      recentRounds: this.lastNRounds,
      runtimePolicy: {
        allowPostTurn: false,
        allowReflection: false,
      },
    });
  }

  async flushSummarize(conversationId: string): Promise<{ flushed: boolean }> {
    return this.summarizeTrigger.flushSummarize(conversationId);
  }
}
