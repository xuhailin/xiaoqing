import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import {
  type DailyMomentEngagementSignal,
  type DailyMomentFeedback,
  type DailyMomentMoodTag,
  type DailyMomentRecord,
  type DailyMomentRepository,
  type DailyMomentSuggestion,
  type DailyMomentTriggerMode,
} from './daily-moment.types';

@Injectable()
export class DailyMomentPrismaRepository implements DailyMomentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeMoodTag(raw: string | null): DailyMomentMoodTag | undefined {
    if (!raw) return undefined;
    const allowed: DailyMomentMoodTag[] = ['轻松', '被逗了一下', '温柔', '小反转', '被接住', '安静的小幸福'];
    return allowed.includes(raw as DailyMomentMoodTag) ? (raw as DailyMomentMoodTag) : undefined;
  }

  async saveRecord(record: DailyMomentRecord): Promise<void> {
    await (this.prisma as any).dailyMoment.create({
      data: {
        id: record.id,
        conversationId: record.conversationId,
        triggerMode: record.triggerMode,
        title: record.title,
        body: record.body,
        closingNote: record.closingNote,
        moodTag: record.moodTag ?? null,
        sourceSnippetIds: record.sourceSnippetIds ?? [],
        sourceMessageIds: record.sourceMessageIds,
        feedback: record.feedback ?? null,
        createdAt: record.createdAt,
      },
    });
  }

  async listRecordsByConversation(conversationId: string): Promise<DailyMomentRecord[]> {
    const rows = await (this.prisma as any).dailyMoment.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return (rows as Array<{
      id: string;
      conversationId: string;
      triggerMode: string;
      title: string;
      body: string;
      closingNote: string;
      moodTag: string | null;
      sourceSnippetIds: string[];
      sourceMessageIds: string[];
      createdAt: Date;
      feedback: string | null;
    }>).map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      triggerMode: row.triggerMode as DailyMomentTriggerMode,
      title: row.title,
      body: row.body,
      closingNote: row.closingNote,
      moodTag: this.normalizeMoodTag(row.moodTag),
      sourceSnippetIds: row.sourceSnippetIds,
      sourceMessageIds: row.sourceMessageIds,
      createdAt: row.createdAt,
      feedback: (row.feedback as DailyMomentFeedback | null) ?? undefined,
    }));
  }

  async saveSuggestion(suggestion: DailyMomentSuggestion): Promise<void> {
    await (this.prisma as any).dailyMomentSuggestion.create({
      data: {
        id: suggestion.id,
        conversationId: suggestion.conversationId,
        hint: suggestion.hint,
        score: suggestion.score,
        moodTag: suggestion.moodTag ?? null,
        sourceMessageIds: suggestion.sourceMessageIds,
        accepted: suggestion.accepted,
        createdAt: suggestion.createdAt,
      },
    });
  }

  async listSuggestionsByConversation(conversationId: string): Promise<DailyMomentSuggestion[]> {
    const rows = await (this.prisma as any).dailyMomentSuggestion.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return (rows as Array<{
      id: string;
      conversationId: string;
      hint: string;
      createdAt: Date;
      score: number;
      moodTag: string | null;
      sourceMessageIds: string[];
      accepted: boolean;
    }>).map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      hint: row.hint,
      createdAt: row.createdAt,
      score: row.score,
      moodTag: this.normalizeMoodTag(row.moodTag),
      sourceMessageIds: row.sourceMessageIds,
      accepted: row.accepted,
    }));
  }

  async markSuggestionAccepted(suggestionId: string): Promise<void> {
    await (this.prisma as any).dailyMomentSuggestion.updateMany({
      where: { id: suggestionId },
      data: {
        accepted: true,
        acceptedAt: new Date(),
      },
    });
  }

  async saveFeedback(recordId: string, feedback: DailyMomentFeedback): Promise<void> {
    await (this.prisma as any).dailyMoment.updateMany({
      where: { id: recordId },
      data: {
        feedback,
      },
    });
  }

  async saveSignal(signal: DailyMomentEngagementSignal): Promise<void> {
    await (this.prisma as any).dailyMomentSignal.create({
      data: {
        id: signal.id,
        conversationId: signal.conversationId,
        type: signal.type,
        sourceText: signal.sourceText ?? null,
        createdAt: signal.createdAt,
      },
    });
  }

  async listSignalsByConversation(conversationId: string): Promise<DailyMomentEngagementSignal[]> {
    const rows = await (this.prisma as any).dailyMomentSignal.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return (rows as Array<{
      id: string;
      conversationId: string;
      type: string;
      createdAt: Date;
      sourceText: string | null;
    }>).map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      type: row.type as DailyMomentEngagementSignal['type'],
      createdAt: row.createdAt,
      sourceText: row.sourceText ?? undefined,
    }));
  }
}
