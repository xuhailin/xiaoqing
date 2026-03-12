import { Injectable } from '@nestjs/common';
import { DailyMomentTriggerEvaluator } from './daily-moment-trigger.evaluator';
import { DailyMomentSnippetExtractor } from './daily-moment-snippet.extractor';
import { DailyMomentGenerator } from './daily-moment-generator';
import { DailyMomentPolicy } from './daily-moment-policy';
import { DailyMomentPrismaRepository } from './daily-moment-prisma.repository';
import {
  type DailyMomentChatMessage,
  type DailyMomentFeedback,
  type DailyMomentFeedbackSummary,
  type DailyMomentRecord,
  type DailyMomentSuggestion,
  type DailyMomentSuggestionCheckResult,
  type DailyMomentTriggerContext,
  type DailyMomentTriggerMode,
} from './daily-moment.types';

export interface DailyMomentUserTriggerIntent {
  shouldGenerate: boolean;
  mode?: DailyMomentTriggerMode;
  acceptedSuggestionId?: string;
}

@Injectable()
export class DailyMomentService {
  constructor(
    private readonly evaluator: DailyMomentTriggerEvaluator,
    private readonly extractor: DailyMomentSnippetExtractor,
    private readonly generator: DailyMomentGenerator,
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

  async generateMomentEntry(input: {
    conversationId: string;
    recentMessages: DailyMomentChatMessage[];
    now: Date;
    triggerMode: DailyMomentTriggerMode;
    acceptedSuggestionId?: string;
  }): Promise<{ record: DailyMomentRecord; renderedText: string }> {
    const snippet = this.extractor.pickPrimarySnippet(input.conversationId, input.recentMessages);

    const draft = await this.generator.generate({
      now: input.now,
      triggerMode: input.triggerMode,
      snippet,
      lightweightFallback: snippet.messages.length < 3,
    });

    const record: DailyMomentRecord = {
      id: this.newId('dmr'),
      conversationId: input.conversationId,
      triggerMode: input.triggerMode,
      title: draft.title,
      body: draft.body,
      closingNote: draft.closingNote,
      moodTag: draft.moodTag,
      sourceSnippetIds: draft.sourceSnippetIds,
      sourceMessageIds: snippet.messageIds,
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

  async maybeSuggest(input: {
    conversationId: string;
    recentMessages: DailyMomentChatMessage[];
    now: Date;
    triggerContext: Omit<DailyMomentTriggerContext, 'now' | 'hasRecentTriggerInSession' | 'policyBlocked'>;
  }): Promise<DailyMomentSuggestionCheckResult> {
    const suggestions = await this.repo.listSuggestionsByConversation(input.conversationId);
    const feedback = await this.getFeedbackSummary(input.conversationId, input.now);

    const policyDecision = this.policy.evaluate({
      conversationId: input.conversationId,
      now: input.now,
      isSeriousTopic: this.isSeriousTopic(input.triggerContext, input.recentMessages),
      shortReplyStreak: this.countUserShortReplyStreak(input.recentMessages),
      feedbackSummary: feedback,
      recentSuggestions: suggestions,
    });

    const evaluation = this.evaluator.evaluate(
      input.recentMessages,
      {
        ...input.triggerContext,
        now: input.now,
        hasRecentTriggerInSession: this.policy.hasRecentSessionTrigger(suggestions, input.now),
        policyBlocked: !policyDecision.allow,
      },
      policyDecision.scoreBias,
    );

    if (!policyDecision.allow || evaluation.decision !== 'suggest') {
      return {
        shouldSuggest: false,
        evaluation,
      };
    }

    const moodTag = evaluation.moodTag;
    const sameMoodExists = this.hasSameMoodSuggestionToday(suggestions, input.now, moodTag);
    if (sameMoodExists) {
      return {
        shouldSuggest: false,
        evaluation: {
          ...evaluation,
          decision: 'none',
          reasons: [...evaluation.reasons, 'same-mood-already-suggested-today'],
        },
      };
    }

    const snippet = this.extractor.pickPrimarySnippet(input.conversationId, input.recentMessages);
    const hint = this.pickHint(suggestions.length);

    const suggestion: DailyMomentSuggestion = {
      id: this.newId('dms'),
      conversationId: input.conversationId,
      hint,
      createdAt: input.now,
      score: evaluation.score,
      moodTag,
      sourceMessageIds: snippet.messageIds,
      accepted: false,
    };

    await this.repo.saveSuggestion(suggestion);

    return {
      shouldSuggest: true,
      evaluation,
      suggestion,
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
      record.closingNote,
    ];

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

  private countUserShortReplyStreak(messages: DailyMomentChatMessage[]): number {
    let streak = 0;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg.role !== 'user') continue;
      if (msg.content.trim().length <= 8) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
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

    const summary: DailyMomentFeedbackSummary = {
      likeCount: records.filter((r) => r.feedback === 'like').length,
      awkwardCount: records.filter((r) => r.feedback === 'awkward').length,
      neutralCount: records.filter((r) => r.feedback === 'neutral').length,
      ignoredCount: 0,
      positiveSignalCount: signals.filter((s) => s.type === 'positive').length,
      negativeSignalCount: signals.filter((s) => s.type === 'negative').length,
      acceptedSuggestionCount: signals.filter((s) => s.type === 'accepted_suggestion').length,
      repeatRequestCount: signals.filter((s) => s.type === 'repeat_request').length,
      bookmarkOrViewCount: signals.filter((s) => s.type === 'bookmark_or_view').length,
    };

    // 30 分钟仍未接住的提示，视为一次冷处理。
    summary.ignoredCount = suggestions.filter(
      (s) => !s.accepted && now.getTime() - s.createdAt.getTime() > 30 * 60 * 1000,
    ).length;

    return summary;
  }

  private isSeriousTopic(
    triggerContext: Omit<DailyMomentTriggerContext, 'now' | 'hasRecentTriggerInSession' | 'policyBlocked'>,
    messages: DailyMomentChatMessage[],
  ): boolean {
    if (triggerContext.intentMode === 'task') return true;
    if (triggerContext.intentSeriousness === 'focused') return true;

    const latestUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    return /(撑不住|很难受|崩溃|救命|怎么办|求你|紧急|严重)/.test(latestUser);
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
