import { Injectable } from '@nestjs/common';
import {
  type DailyMomentPolicyDecision,
  type DailyMomentPolicyInput,
  type DailyMomentSuggestion,
} from './daily-moment.types';

@Injectable()
export class DailyMomentPolicy {
  private readonly maxDailySuggestions = 2;
  private readonly maxHourlySuggestions = 1;
  private readonly cooldownMinutes = 45;

  evaluate(input: DailyMomentPolicyInput): DailyMomentPolicyDecision {
    if (input.isSeriousTopic) {
      return { allow: false, reason: 'serious-topic', scoreBias: 0 };
    }

    if (input.shortReplyStreak >= 4) {
      return { allow: false, reason: 'short-reply-streak', scoreBias: 0 };
    }

    const todaySuggestions = this.filterSameDay(input.recentSuggestions, input.now);
    if (todaySuggestions.length >= this.maxDailySuggestions) {
      return { allow: false, reason: 'daily-cap-reached', scoreBias: 0 };
    }

    const recentOneHour = input.recentSuggestions.filter(
      (s) => input.now.getTime() - s.createdAt.getTime() <= 60 * 60 * 1000,
    );
    if (recentOneHour.length >= this.maxHourlySuggestions) {
      return { allow: false, reason: 'hourly-cap-reached', scoreBias: 0 };
    }

    const latest = this.pickLatest(input.recentSuggestions);
    if (latest) {
      const gapMinutes = (input.now.getTime() - latest.createdAt.getTime()) / 60000;
      if (gapMinutes < this.cooldownMinutes) {
        return { allow: false, reason: 'cooldown', scoreBias: 0 };
      }
    }

    return {
      allow: true,
      scoreBias: this.computeAdaptiveScoreBias(input),
    };
  }

  hasRecentSessionTrigger(
    suggestions: DailyMomentSuggestion[],
    now: Date,
    minutes = 20,
  ): boolean {
    return suggestions.some((s) => now.getTime() - s.createdAt.getTime() <= minutes * 60 * 1000);
  }

  private computeAdaptiveScoreBias(input: DailyMomentPolicyInput): number {
    let bias = 0;
    // 连续短句不一定屏蔽，但应提高触发门槛，避免频繁打扰。
    if (input.shortReplyStreak >= 2) bias += 0.07;

    // 负反馈/冷处理提升保守度。
    if (input.feedbackSummary.awkwardCount >= 1) bias += 0.08;
    if (input.feedbackSummary.awkwardCount >= 2) bias += 0.08;
    if (input.feedbackSummary.ignoredCount >= 2) bias += 0.1;
    if (input.feedbackSummary.negativeSignalCount >= 2) bias += 0.1;

    // 正反馈降低门槛，但不会过度激进。
    if (input.feedbackSummary.likeCount >= 1) bias -= 0.05;
    if (input.feedbackSummary.positiveSignalCount >= 2) bias -= 0.05;
    if (input.feedbackSummary.acceptedSuggestionCount >= 1) bias -= 0.04;
    if (input.feedbackSummary.repeatRequestCount >= 1) bias -= 0.04;
    if (input.feedbackSummary.bookmarkOrViewCount >= 1) bias -= 0.03;

    return Math.max(-0.1, Math.min(0.3, bias));
  }

  private pickLatest(suggestions: DailyMomentSuggestion[]): DailyMomentSuggestion | null {
    if (suggestions.length === 0) return null;
    return [...suggestions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  }

  private filterSameDay(suggestions: DailyMomentSuggestion[], now: Date): DailyMomentSuggestion[] {
    const key = this.dayKey(now);
    return suggestions.filter((s) => this.dayKey(s.createdAt) === key);
  }

  private dayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
