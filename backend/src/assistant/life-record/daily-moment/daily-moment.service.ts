import { Injectable, Logger } from '@nestjs/common';
import { DailySummaryService } from '../daily-summary/daily-summary.service';
import { DailyMomentPrismaRepository } from './daily-moment-prisma.repository';
import {
  type DailyMomentFeedback,
  type DailyMomentMoodTag,
  type DailyMomentRecord,
  type DailyMomentTriggerMode,
} from './daily-moment.types';

export interface DailyMomentUserTriggerIntent {
  shouldGenerate: boolean;
  mode?: DailyMomentTriggerMode;
}

@Injectable()
export class DailyMomentService {
  private readonly logger = new Logger(DailyMomentService.name);

  constructor(
    private readonly dailySummaryService: DailySummaryService,
    private readonly repo: DailyMomentPrismaRepository,
  ) {}

  async detectUserTriggerIntent(
    conversationId: string,
    userInput: string,
    now: Date,
  ): Promise<DailyMomentUserTriggerIntent> {
    const text = userInput.trim();
    if (!text) return { shouldGenerate: false };

    if (this.isManualDiaryCommand(text)) {
      return { shouldGenerate: true, mode: 'manual' };
    }

    return { shouldGenerate: false };
  }

  /**
   * 生成日记条目。
   * 合并后管线：TracePoints → DailySummaryGenerator → DailyMomentRecord
   */
  async generateMomentEntry(input: {
    conversationId: string;
    now: Date;
    triggerMode: DailyMomentTriggerMode;
  }): Promise<{ record: DailyMomentRecord; renderedText: string }> {
    const dayKey = this.dayKey(input.now);

    const summary = await this.dailySummaryService.generateForDay(dayKey);

    const record: DailyMomentRecord = {
      id: this.newId('dmr'),
      conversationId: input.conversationId,
      triggerMode: input.triggerMode,
      title: summary.title,
      body: summary.body,
      closingNote: '',
      moodTag: this.mapMoodToTag(summary.moodOverall),
      sourceSnippetIds: [],
      sourceMessageIds: [],
      createdAt: input.now,
    };

    await this.repo.saveRecord(record);

    return {
      record,
      renderedText: this.renderForChat(record),
    };
  }

  async saveFeedback(
    conversationId: string,
    recordId: string,
    feedback: DailyMomentFeedback,
  ): Promise<void> {
    await this.repo.saveFeedback(recordId, feedback);
  }

  async listRecords(conversationId: string): Promise<DailyMomentRecord[]> {
    return this.repo.listRecordsByConversation(conversationId);
  }

  renderForChat(record: DailyMomentRecord): string {
    const lines = [
      `今日日记 | ${record.title}`,
      record.body,
    ];

    if (record.closingNote) {
      lines.push(record.closingNote);
    }

    if (record.moodTag) {
      lines.push(`#${record.moodTag}`);
    }
    return lines.join('\n\n');
  }

  private isManualDiaryCommand(text: string): boolean {
    return /(写个今日日记|发个今日小记录|记一下今天这段|这段可以写进日记|写一条今日日记|今天这段记一下|再写一条|再来一条|再写个日记)/.test(
      text,
    );
  }

  private mapMoodToTag(mood: string | null | undefined): DailyMomentMoodTag | undefined {
    if (!mood) return undefined;
    const mapping: Record<string, DailyMomentMoodTag> = {
      frustrated: '轻松',
      relaxed: '轻松',
      neutral: '轻松',
      amused: '被逗了一下',
      warm: '温柔',
      peaceful: '安静的小幸福',
    };
    return mapping[mood] ?? undefined;
  }

  private dayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private newId(prefix: string): string {
    const rand = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${rand}`;
  }
}
