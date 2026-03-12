"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyMomentTriggerEvaluator = void 0;
const common_1 = require("@nestjs/common");
const clamp01 = (v) => Math.max(0, Math.min(1, v));
let DailyMomentTriggerEvaluator = class DailyMomentTriggerEvaluator {
    lowThreshold = 0.48;
    highThreshold = 0.62;
    evaluate(messages, context, scoreBias = 0) {
        const reasons = [];
        const suppression = this.resolveSuppression(messages, context);
        if (suppression) {
            return {
                decision: 'none',
                suppressionReason: suppression,
                reasons: [suppression],
                score: 0,
                threshold: { low: this.lowThreshold, high: this.highThreshold },
                breakdown: {
                    fun: 0,
                    atmosphere: 0,
                    completeness: 0,
                    companionship: 0,
                    initiative: 0,
                    total: 0,
                },
            };
        }
        const fun = this.scoreFun(messages, reasons);
        const atmosphere = this.scoreAtmosphere(messages, reasons);
        const completeness = this.scoreCompleteness(messages, reasons);
        const companionship = this.scoreCompanionship(messages, reasons);
        const initiative = this.scoreInitiative(messages, reasons);
        const total = clamp01(fun * 0.3 + atmosphere * 0.2 + completeness * 0.2 + companionship * 0.2 + initiative * 0.1);
        const adjustedHigh = clamp01(this.highThreshold + scoreBias);
        const adjustedLow = clamp01(this.lowThreshold + scoreBias * 0.6);
        const decision = total < adjustedLow
            ? 'none'
            : total < adjustedHigh
                ? 'candidate'
                : 'suggest';
        const moodTag = this.inferMoodTag({
            fun,
            atmosphere,
            completeness,
            companionship,
            initiative,
            total,
        });
        return {
            decision,
            score: total,
            threshold: { low: adjustedLow, high: adjustedHigh },
            breakdown: { fun, atmosphere, completeness, companionship, initiative, total },
            reasons,
            ...(moodTag ? { moodTag } : {}),
        };
    }
    resolveSuppression(messages, context) {
        if (context.policyBlocked)
            return 'policy_blocked';
        if (context.hasRecentTriggerInSession)
            return 'cooldown_active';
        if (context.intentRequiresTool || context.intentMode === 'task') {
            return 'tool_or_task_context';
        }
        if (context.isImportantIssueInProgress) {
            return 'important_issue_in_progress';
        }
        const seriousness = String(context.intentSeriousness ?? '').toLowerCase();
        if (seriousness === 'focused')
            return 'serious_or_sensitive_context';
        const emotion = String(context.detectedEmotion ?? '').toLowerCase();
        const latestUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
        if (['low', 'hurt', 'anxious'].includes(emotion) ||
            /(撑不住|崩溃|真的很难受|想哭|活不下去|不想活|没意义)/.test(latestUser)) {
            return 'high_negative_emotion';
        }
        return null;
    }
    scoreFun(messages, reasons) {
        const text = messages.map((m) => m.content).join('\n');
        const markerHits = this.countHits(text, [
            /哈哈|hh|笑死|逗|坏一下|嘴硬|噎住|反将一军|想多了/g,
            /你连.+都.+吧/g,
        ]);
        const turnBounce = this.turnBounce(messages);
        if (markerHits > 0)
            reasons.push(`fun-marker:${markerHits}`);
        return clamp01(markerHits * 0.22 + turnBounce * 0.45);
    }
    scoreAtmosphere(messages, reasons) {
        const text = messages.map((m) => m.content).join('\n');
        const warm = this.countHits(text, [/(温柔|安心|放松|接住|陪着|慢慢来|没关系|好呀)/g]);
        const light = this.countHits(text, [/(轻松|好玩|可爱|今天这段|嘿嘿|嗯嗯)/g]);
        const negative = this.countHits(text, [/(崩溃|绝望|救命|烦死|痛苦|受不了)/g]);
        if (warm + light > 0)
            reasons.push(`atmosphere-positive:${warm + light}`);
        return clamp01(0.15 + warm * 0.18 + light * 0.12 - negative * 0.2);
    }
    scoreCompleteness(messages, reasons) {
        if (messages.length < 3)
            return 0.15;
        const n = messages.length;
        const lengthScore = clamp01((n - 3) / 7);
        const alternation = this.turnBounce(messages);
        const text = messages.map((m) => m.content).join('\n');
        const pivot = this.countHits(text, [/(结果|本来|后来|但是|然后|反而|那就好|好吧)/g]);
        if (pivot > 0)
            reasons.push(`snippet-pivot:${pivot}`);
        return clamp01(lengthScore * 0.4 + alternation * 0.4 + Math.min(1, pivot * 0.35) * 0.2);
    }
    scoreCompanionship(messages, reasons) {
        const text = messages.map((m) => m.content).join('\n');
        const pairMentions = this.countHits(text, [/(你|我|我们|咱们|一起|陪你|陪我)/g]);
        const receiving = this.countHits(text, [/(接住|懂你|在这儿|我在|那就好)/g]);
        if (pairMentions > 0)
            reasons.push(`companionship-pair:${pairMentions}`);
        return clamp01(pairMentions * 0.06 + receiving * 0.24 + 0.1);
    }
    scoreInitiative(messages, reasons) {
        const userMessages = messages.filter((m) => m.role === 'user');
        if (userMessages.length === 0)
            return 0;
        const ratio = userMessages.length / messages.length;
        const avgLen = userMessages.reduce((acc, m) => acc + m.content.trim().length, 0) / userMessages.length;
        const continuedTurns = userMessages.length >= 2 ? 1 : 0;
        if (continuedTurns)
            reasons.push('initiative:continued-user-turns');
        return clamp01(ratio * 0.45 + clamp01(avgLen / 18) * 0.35 + continuedTurns * 0.2);
    }
    turnBounce(messages) {
        if (messages.length <= 1)
            return 0;
        let switched = 0;
        for (let i = 1; i < messages.length; i += 1) {
            if (messages[i - 1].role !== messages[i].role)
                switched += 1;
        }
        return clamp01(switched / (messages.length - 1));
    }
    countHits(text, patterns) {
        return patterns.reduce((acc, re) => acc + (text.match(re)?.length ?? 0), 0);
    }
    inferMoodTag(b) {
        if (b.fun >= 0.72)
            return '被逗了一下';
        if (b.companionship >= 0.7)
            return '被接住';
        if (b.atmosphere >= 0.68)
            return '温柔';
        if (b.completeness >= 0.72 && b.fun >= 0.5)
            return '小反转';
        if (b.total >= 0.62)
            return '轻松';
        return undefined;
    }
};
exports.DailyMomentTriggerEvaluator = DailyMomentTriggerEvaluator;
exports.DailyMomentTriggerEvaluator = DailyMomentTriggerEvaluator = __decorate([
    (0, common_1.Injectable)()
], DailyMomentTriggerEvaluator);
//# sourceMappingURL=daily-moment-trigger.evaluator.js.map