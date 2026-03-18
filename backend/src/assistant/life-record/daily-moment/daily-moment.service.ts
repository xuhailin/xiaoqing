import { Injectable, Logger } from '@nestjs/common';
import { TracePointService } from '../trace-point/trace-point.service';
import { DailySummaryService } from '../daily-summary/daily-summary.service';
import { DailyMomentPolicy } from './daily-moment-policy';
import { DailyMomentPrismaRepository } from './daily-moment-prisma.repository';
import {
  type DailyMomentFeedback,
  type DailyMomentFeedbackSummary,
  type DailyMomentMoodTag,
  type DailyMomentRecord,
  type DailyMomentSuggestion,
  type DailyMomentTriggerMode,
} from './daily-moment.types';

export interface DailyMomentUserTriggerIntent {
  shouldGenerate: boolean;
  mode?: DailyMomentTriggerMode;
  acceptedSuggestionId?: string;
}

export interface DailyMomentSuggestionResult {
  shouldSuggest: boolean;
  suggestion?: DailyMomentSuggestion;
  reason: string;
}

/** 今天至少有 N 个 TracePoint 时才值得生成/建议日记 */
const MIN_POINTS_FOR_DIARY = 3;

@Injectable()
export class DailyMomentService {
  private readonly logger = new Logger(DailyMomentService.name);

  constructor(
    private readonly tracePointService: TracePointService,
    private readonly dailySummaryService: DailySummaryService,
    private readonly policy: DailyMomentPolicy,
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

    const latestPendingSuggestion = await this.getLatestPendingSuggestion(conversationId, now);
    if (latestPendingSuggestion && this.isAcceptSuggestionCommand(text)) {
      return {
        shouldGenerate: true,
        mode: 'accepted',
        acceptedSuggestionId: latestPendingSuggestion.id,
      };
    }

    return { shouldGenerate: false };
  }

  async ingestUserSignal(
    conversationId: string,
    userInput: string,
    now: Date,
  ): Promise<void> {
    const text = userInput.trim();
    if (!text) return;

    if (this.isNegativeFeedbackCommand(text)) {
      await this.repo.saveSignal({
        id: this.newId('dmsig'),
        conversationId,
        type: 'negative',
        createdAt: now,
        sourceText: text.slice(0, 120),
      });
      return;
    }

    if (this.isRepeatManualDiaryCommand(text)) {
      await this.repo.saveSignal({
        id: this.newId('dmsig'),
        conversationId,
        type: 'repeat_request',
        createdAt: now,
        sourceText: text.slice(0, 120),
      });
      return;
    }

    if (this.isBookmarkOrViewCommand(text)) {
      await this.repo.saveSignal({
        id: this.newId('dmsig'),
        conversationId,
        type: 'bookmark_or_view',
        createdAt: now,
        sourceText: text.slice(0, 120),
      });
      return;
    }

    if (this.isPositiveFeedbackCommand(text)) {
      await this.repo.saveSignal({
        id: this.newId('dmsig'),
        conversationId,
        type: 'positive',
        createdAt: now,
        sourceText: text.slice(0, 120),
      });
    }
  }

  /**
   * 生成日记条目。
   * 合并后管线：TracePoints → DailySummaryGenerator → DailyMomentRecord
   */
  async generateMomentEntry(input: {
    conversationId: string;
    now: Date;
    triggerMode: DailyMomentTriggerMode;
    acceptedSuggestionId?: string;
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

    if (input.acceptedSuggestionId) {
      await this.repo.markSuggestionAccepted(input.acceptedSuggestionId);
      await this.repo.saveSignal({
        id: this.newId('dmsig'),
        conversationId: input.conversationId,
        type: 'accepted_suggestion',
        createdAt: input.now,
      });
    }

    return {
      record,
      renderedText: this.renderForChat(record),
    };
  }

  /**
   * 判断是否应该向用户建议写日记。
   * 合并后简化：检查今天 TracePoint 数量 + Policy 限流。
   */
  async maybeSuggest(input: {
    conversationId: string;
    now: Date;
  }): Promise<DailyMomentSuggestionResult> {
    const dayKey = this.dayKey(input.now);
    const points = await this.tracePointService.getPointsForDay(dayKey);

    if (points.length < MIN_POINTS_FOR_DIARY) {
      return {
        shouldSuggest: false,
        reason: `only ${points.length} trace points today (need >= ${MIN_POINTS_FOR_DIARY})`,
      };
    }

    const suggestions = await this.repo.listSuggestionsByConversation(input.conversationId);
    const feedback = await this.getFeedbackSummary(input.conversationId, input.now);

    const policyDecision = this.policy.evaluate({
      conversationId: input.conversationId,
      now: input.now,
      isSeriousTopic: false,
      shortReplyStreak: 0,
      feedbackSummary: feedback,
      recentSuggestions: suggestions,
    });

    if (!policyDecision.allow) {
      return {
        shouldSuggest: false,
        reason: policyDecision.reason ?? 'policy_blocked',
      };
    }

    const dominantMood = this.dominantMood(points);
    const moodTag = this.mapMoodToTag(dominantMood);
    if (moodTag && this.hasSameMoodSuggestionToday(suggestions, input.now, moodTag)) {
      return {
        shouldSuggest: false,
        reason: 'same-mood-already-suggested-today',
      };
    }

    const hint = this.pickHint(suggestions.length);
    const suggestion: DailyMomentSuggestion = {
      id: this.newId('dms'),
      conversationId: input.conversationId,
      hint,
      createdAt: input.now,
      score: points.length / 10,
      moodTag,
      sourceMessageIds: [],
      accepted: false,
    };

    await this.repo.saveSuggestion(suggestion);

    return {
      shouldSuggest: true,
      suggestion,
      reason: `${points.length} trace points today`,
    };
  }

  async saveFeedback(
    conversationId: string,
    recordId: string,
    feedback: DailyMomentFeedback,
  ): Promise<void> {
    await this.repo.saveFeedback(recordId, feedback);
    if (feedback === 'like' || feedback === 'awkward') {
      await this.repo.saveSignal({
        id: this.newId('dmsig'),
        conversationId,
        type: feedback === 'like' ? 'positive' : 'negative',
        createdAt: new Date(),
      });
    }
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

  private isAcceptSuggestionCommand(text: string): boolean {
    return /(那就写吧|写吧|记下来|好呀写|可以写了|收起来吧|那你记一下)/.test(text);
  }

  private isRepeatManualDiaryCommand(text: string): boolean {
    return /(再写一条|再来一条|再写个日记|再记一条)/.test(text);
  }

  private isPositiveFeedbackCommand(text: string): boolean {
    return /(好可爱|很可爱|喜欢这种|我喜欢这个|这个功能不错|这功能好玩|写得好|挺喜欢)/.test(text);
  }

  private isNegativeFeedbackCommand(text: string): boolean {
    return /(有点尴尬|好尴尬|没必要|不用写|别写了|不需要这个|无感|别记了)/.test(text);
  }

  private isBookmarkOrViewCommand(text: string): boolean {
    return /(收藏|存起来|回看|看看日记|查看日记|翻翻那条日记)/.test(text);
  }

  private async getLatestPendingSuggestion(
    conversationId: string,
    now: Date,
  ): Promise<DailyMomentSuggestion | null> {
    const all = await this.repo.listSuggestionsByConversation(conversationId);
    const latest = [...all]
      .filter((s) => !s.accepted)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!latest) return null;
    const ageMinutes = (now.getTime() - latest.createdAt.getTime()) / 60000;
    return ageMinutes <= 90 ? latest : null;
  }

  private hasSameMoodSuggestionToday(
    suggestions: DailyMomentSuggestion[],
    now: Date,
    moodTag?: string,
  ): boolean {
    if (!moodTag) return false;
    const day = this.dayKey(now);
    return suggestions.some((s) => this.dayKey(s.createdAt) === day && s.moodTag === moodTag);
  }

  private async getFeedbackSummary(
    conversationId: string,
    now: Date,
  ): Promise<DailyMomentFeedbackSummary> {
    const records = await this.repo.listRecordsByConversation(conversationId);
    const suggestions = await this.repo.listSuggestionsByConversation(conversationId);
    const signals = await this.repo.listSignalsByConversation(conversationId);

    return {
      likeCount: records.filter((r) => r.feedback === 'like').length,
      awkwardCount: records.filter((r) => r.feedback === 'awkward').length,
      neutralCount: records.filter((r) => r.feedback === 'neutral').length,
      ignoredCount: suggestions.filter(
        (s) => !s.accepted && now.getTime() - s.createdAt.getTime() > 30 * 60 * 1000,
      ).length,
      positiveSignalCount: signals.filter((s) => s.type === 'positive').length,
      negativeSignalCount: signals.filter((s) => s.type === 'negative').length,
      acceptedSuggestionCount: signals.filter((s) => s.type === 'accepted_suggestion').length,
      repeatRequestCount: signals.filter((s) => s.type === 'repeat_request').length,
      bookmarkOrViewCount: signals.filter((s) => s.type === 'bookmark_or_view').length,
    };
  }

  private dominantMood(points: Array<{ mood: string | null }>): string | null {
    const counts = new Map<string, number>();
    for (const p of points) {
      if (p.mood) counts.set(p.mood, (counts.get(p.mood) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
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

  private pickHint(existingSuggestionCount: number): string {
    const hints = [
      '这段都够我记进今天的小日记了。',
      '这段有点想偷偷记下来。',
      '今天这小片段还挺值得收着。',
    ];
    return hints[existingSuggestionCount % hints.length] ?? hints[0];
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
