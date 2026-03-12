"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyMomentPolicy = void 0;
const common_1 = require("@nestjs/common");
let DailyMomentPolicy = class DailyMomentPolicy {
    maxDailySuggestions = 2;
    maxHourlySuggestions = 1;
    cooldownMinutes = 45;
    evaluate(input) {
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
        const recentOneHour = input.recentSuggestions.filter((s) => input.now.getTime() - s.createdAt.getTime() <= 60 * 60 * 1000);
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
    hasRecentSessionTrigger(suggestions, now, minutes = 20) {
        return suggestions.some((s) => now.getTime() - s.createdAt.getTime() <= minutes * 60 * 1000);
    }
    computeAdaptiveScoreBias(input) {
        let bias = 0;
        if (input.shortReplyStreak >= 2)
            bias += 0.07;
        if (input.feedbackSummary.awkwardCount >= 1)
            bias += 0.08;
        if (input.feedbackSummary.awkwardCount >= 2)
            bias += 0.08;
        if (input.feedbackSummary.ignoredCount >= 2)
            bias += 0.1;
        if (input.feedbackSummary.negativeSignalCount >= 2)
            bias += 0.1;
        if (input.feedbackSummary.likeCount >= 1)
            bias -= 0.05;
        if (input.feedbackSummary.positiveSignalCount >= 2)
            bias -= 0.05;
        if (input.feedbackSummary.acceptedSuggestionCount >= 1)
            bias -= 0.04;
        if (input.feedbackSummary.repeatRequestCount >= 1)
            bias -= 0.04;
        if (input.feedbackSummary.bookmarkOrViewCount >= 1)
            bias -= 0.03;
        return Math.max(-0.1, Math.min(0.3, bias));
    }
    pickLatest(suggestions) {
        if (suggestions.length === 0)
            return null;
        return [...suggestions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    }
    filterSameDay(suggestions, now) {
        const key = this.dayKey(now);
        return suggestions.filter((s) => this.dayKey(s.createdAt) === key);
    }
    dayKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
};
exports.DailyMomentPolicy = DailyMomentPolicy;
exports.DailyMomentPolicy = DailyMomentPolicy = __decorate([
    (0, common_1.Injectable)()
], DailyMomentPolicy);
//# sourceMappingURL=daily-moment-policy.js.map