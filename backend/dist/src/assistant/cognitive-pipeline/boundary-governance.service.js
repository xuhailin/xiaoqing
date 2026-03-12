"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoundaryGovernanceService = void 0;
const common_1 = require("@nestjs/common");
const DEFAULT_REVIEW_RULES = [
    { condition: 'truth_risk', pattern: '绝对', replacement: '大概率', label: 'softened-overcertainty' },
    { condition: 'truth_risk', pattern: '一定会', replacement: '未必会', label: 'softened-overcertainty' },
    { condition: 'truth_risk', pattern: '百分百', replacement: '很大概率', label: 'softened-overcertainty' },
    { condition: 'fragility_high', pattern: '你应该', replacement: '你可以先考虑', label: 'softened-imperative' },
    { condition: 'fragility_high', pattern: '你得', replacement: '你可以先', label: 'softened-imperative' },
    { condition: 'fragility_high', pattern: '必须', replacement: '不一定非得', label: 'softened-imperative' },
    { condition: 'capability_risk', pattern: '我已经帮你[^，。！？!?.]*(了|啦)', replacement: '这件事我还没有替你实际做掉', label: 'removed-false-capability-claim' },
    { condition: 'capability_risk', pattern: '已经帮你处理好了', replacement: '我现在还不能直接替你处理完', label: 'removed-false-capability-claim' },
    { condition: 'relational_risk', pattern: '你得相信我', replacement: '你不用急着相信我', label: 'removed-relational-pressure' },
    { condition: 'relational_risk', pattern: '听我的', replacement: '你可以自己判断', label: 'removed-relational-pressure' },
    { condition: 'relational_risk', pattern: '别想太多，照做就行', replacement: '不用急着照做，你可以先按自己的节奏来', label: 'removed-relational-pressure' },
];
let BoundaryGovernanceService = class BoundaryGovernanceService {
    rules = DEFAULT_REVIEW_RULES;
    setCustomRules(rules) {
        this.rules = rules;
    }
    addRules(rules) {
        this.rules = [...this.rules, ...rules];
    }
    resetRules() {
        this.rules = DEFAULT_REVIEW_RULES;
    }
    getRules() {
        return [...this.rules];
    }
    buildPreflight(turnState) {
        const notes = [];
        const shouldRestrictInitiative = turnState.safety.relationalBoundaryRisk || turnState.userState.fragility === 'high';
        const forceSoftenTone = turnState.userState.fragility === 'high';
        const disallowCapabilityClaims = turnState.safety.capabilityBoundaryRisk;
        if (shouldRestrictInitiative)
            notes.push('reduce-pressure-and-initiative');
        if (forceSoftenTone)
            notes.push('soften-tone-and-avoid-pushing');
        if (disallowCapabilityClaims)
            notes.push('do-not-claim-actions-not-executed');
        if (turnState.safety.truthBoundaryRisk)
            notes.push('avoid-overstating-certainty');
        return {
            shouldRestrictInitiative,
            forceSoftenTone,
            disallowCapabilityClaims,
            notes,
        };
    }
    buildPreflightPrompt(preflight) {
        if (preflight.notes.length === 0)
            return '';
        const lines = ['[边界治理预检]'];
        if (preflight.shouldRestrictInitiative) {
            lines.push('- 降低推动感，不制造压力，不用内疚感推进用户。');
        }
        if (preflight.forceSoftenTone) {
            lines.push('- 当前语气必须更稳更软，先保证安全感。');
        }
        if (preflight.disallowCapabilityClaims) {
            lines.push('- 不要声称已经完成任何未实际执行的动作。');
        }
        lines.push(`- notes: ${preflight.notes.join('; ')}`);
        return lines.join('\n');
    }
    reviewGeneratedReply(content, turnState, opts = {}) {
        let next = content;
        const reasons = [];
        for (const rule of this.rules) {
            if (!this.shouldApplyRule(rule, turnState, opts))
                continue;
            const regex = new RegExp(rule.pattern, 'g');
            const replaced = next.replace(regex, rule.replacement);
            if (replaced !== next) {
                next = replaced;
                if (!reasons.includes(rule.label)) {
                    reasons.push(rule.label);
                }
            }
        }
        return {
            content: next,
            adjusted: reasons.length > 0,
            reasons,
        };
    }
    shouldApplyRule(rule, turnState, opts) {
        switch (rule.condition) {
            case 'truth_risk':
                return turnState.safety.truthBoundaryRisk;
            case 'fragility_high':
                return turnState.userState.fragility === 'high';
            case 'capability_risk':
                return !opts.toolWasActuallyUsed && turnState.safety.capabilityBoundaryRisk;
            case 'relational_risk':
                return turnState.safety.relationalBoundaryRisk;
            default:
                return false;
        }
    }
};
exports.BoundaryGovernanceService = BoundaryGovernanceService;
exports.BoundaryGovernanceService = BoundaryGovernanceService = __decorate([
    (0, common_1.Injectable)()
], BoundaryGovernanceService);
//# sourceMappingURL=boundary-governance.service.js.map