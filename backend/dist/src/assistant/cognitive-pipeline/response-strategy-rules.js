"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESPONSE_STRATEGY_RULES = void 0;
exports.matchStrategyRule = matchStrategyRule;
exports.resolveResponseStrategy = resolveResponseStrategy;
exports.RESPONSE_STRATEGY_RULES = [
    {
        priority: 0,
        label: 'tool-execution',
        conditions: { requiresTool: true },
        strategy: {
            primaryMode: 'execute',
            secondaryMode: 'none',
            depth: 'brief',
            initiative: 'balanced',
            goal: 'complete_task',
        },
    },
    {
        priority: 1,
        label: 'high-fragility-or-understanding',
        conditions: { fragility: 'high', needMode: 'understanding' },
        strategy: {
            primaryMode: 'empathize',
            secondaryMode: 'soothe',
            depth: 'brief',
            initiative: 'passive',
            goal: 'stabilize_user',
        },
    },
    {
        priority: 2,
        label: 'decision-mode',
        conditions: { needMode: 'decision' },
        strategy: {
            primaryMode: 'decide',
            secondaryMode: 'challenge',
            depth: 'deep',
            initiative: 'proactive',
            goal: 'move_decision',
        },
    },
    {
        priority: 3,
        label: 'co-thinking',
        conditions: { needMode: 'co_thinking', situationKind: 'co_thinking' },
        strategy: {
            primaryMode: 'reflect',
            secondaryMode: 'gentle_probe',
            depth: 'medium',
            initiative: 'balanced',
            goal: 'co_think',
        },
    },
    {
        priority: 4,
        label: 'advice-request',
        conditions: { needMode: 'advice' },
        strategy: {
            primaryMode: 'advise',
            secondaryMode: 'gentle_probe',
            depth: 'medium',
            initiative: 'balanced',
            goal: 'build_understanding',
        },
    },
    {
        priority: 5,
        label: 'casual-chat',
        conditions: { situationKind: 'casual_chat', needMode: 'companionship' },
        strategy: {
            primaryMode: 'companion',
            secondaryMode: 'none',
            depth: 'medium',
            initiative: 'balanced',
            goal: 'stay_connected',
        },
    },
    {
        priority: 99,
        label: 'default-clarify',
        conditions: {},
        strategy: {
            primaryMode: 'clarify',
            secondaryMode: 'none',
            depth: 'brief',
            initiative: 'passive',
            goal: 'build_understanding',
        },
    },
];
function matchStrategyRule(rule, intentState, situation, userState) {
    const { conditions } = rule;
    if (Object.keys(conditions).length === 0)
        return true;
    if (conditions.requiresTool !== undefined) {
        if (conditions.requiresTool !== !!intentState?.requiresTool)
            return false;
        return true;
    }
    if (rule.label === 'high-fragility-or-understanding') {
        return userState.fragility === 'high' || userState.needMode === 'understanding';
    }
    if (rule.label === 'co-thinking') {
        return userState.needMode === 'co_thinking' || situation.kind === 'co_thinking';
    }
    if (conditions.needMode !== undefined) {
        const allowed = Array.isArray(conditions.needMode) ? conditions.needMode : [conditions.needMode];
        if (!allowed.includes(userState.needMode))
            return false;
    }
    if (conditions.fragility !== undefined) {
        const allowed = Array.isArray(conditions.fragility) ? conditions.fragility : [conditions.fragility];
        if (!allowed.includes(userState.fragility))
            return false;
    }
    if (conditions.situationKind !== undefined) {
        const allowed = Array.isArray(conditions.situationKind) ? conditions.situationKind : [conditions.situationKind];
        if (!allowed.includes(situation.kind))
            return false;
    }
    return true;
}
function resolveResponseStrategy(intentState, situation, userState) {
    const sorted = [...exports.RESPONSE_STRATEGY_RULES].sort((a, b) => a.priority - b.priority);
    for (const rule of sorted) {
        if (matchStrategyRule(rule, intentState, situation, userState)) {
            return { ...rule.strategy };
        }
    }
    return exports.RESPONSE_STRATEGY_RULES[exports.RESPONSE_STRATEGY_RULES.length - 1].strategy;
}
//# sourceMappingURL=response-strategy-rules.js.map