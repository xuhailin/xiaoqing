"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyMomentSnippetExtractor = void 0;
const common_1 = require("@nestjs/common");
let DailyMomentSnippetExtractor = class DailyMomentSnippetExtractor {
    minMessages = 3;
    maxMessages = 16;
    extractCandidates(conversationId, recentMessages, maxCandidates = 3) {
        const base = recentMessages
            .filter((m) => m.content.trim().length > 0)
            .slice(-this.maxMessages);
        if (base.length === 0)
            return [];
        const windows = [];
        const minWindow = Math.min(this.minMessages, base.length);
        const maxWindow = Math.min(this.maxMessages, base.length);
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
    pickPrimarySnippet(conversationId, recentMessages) {
        const candidates = this.extractCandidates(conversationId, recentMessages, 1);
        if (candidates[0])
            return candidates[0];
        const fallback = recentMessages.slice(-Math.min(4, recentMessages.length));
        return this.buildSnippet(conversationId, fallback);
    }
    buildSnippet(conversationId, messages) {
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
    buildSummaryHint(messages) {
        const userLast = [...messages].reverse().find((m) => m.role === 'user')?.content.trim() ?? '';
        const assistantLast = [...messages].reverse().find((m) => m.role === 'assistant')?.content.trim() ?? '';
        const pair = [userLast, assistantLast].filter(Boolean).join(' / ');
        return pair.slice(0, 90);
    }
    scoreSnippet(messages) {
        if (messages.length === 0)
            return 0;
        const alternation = this.scoreAlternation(messages);
        const hasBothRoles = messages.some((m) => m.role === 'user') && messages.some((m) => m.role === 'assistant') ? 1 : 0;
        const text = messages.map((m) => m.content).join('\n');
        const pivot = /(本来|结果|后来|但是|反而|那就好|好吧)/.test(text) ? 1 : 0;
        const mood = /(哈哈|逗|可爱|轻松|接住|安心|好玩)/.test(text) ? 1 : 0;
        return alternation * 0.35 + hasBothRoles * 0.25 + pivot * 0.2 + mood * 0.2;
    }
    scoreAlternation(messages) {
        if (messages.length <= 1)
            return 0;
        let changed = 0;
        for (let i = 1; i < messages.length; i += 1) {
            if (messages[i].role !== messages[i - 1].role)
                changed += 1;
        }
        return changed / (messages.length - 1);
    }
};
exports.DailyMomentSnippetExtractor = DailyMomentSnippetExtractor;
exports.DailyMomentSnippetExtractor = DailyMomentSnippetExtractor = __decorate([
    (0, common_1.Injectable)()
], DailyMomentSnippetExtractor);
//# sourceMappingURL=daily-moment-snippet.extractor.js.map