"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CognitivePipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitivePipelineService = void 0;
const common_1 = require("@nestjs/common");
const response_strategy_rules_1 = require("./response-strategy-rules");
let CognitivePipelineService = class CognitivePipelineService {
    static { CognitivePipelineService_1 = this; }
    analyzeTurn(input) {
        const situation = this.recognizeSituation(input);
        const userState = this.detectUserState(input, situation);
        const relationship = this.estimateRelationship(input);
        const responseStrategy = this.planResponseStrategy(input, situation, userState);
        const judgement = this.buildJudgementContext(input, userState, responseStrategy);
        const value = this.buildValueContext(userState, input);
        const emotionRule = this.buildEmotionContext(userState, input);
        const affinity = this.buildAffinityContext(userState, relationship);
        const rhythm = this.buildRhythmContext(input, responseStrategy, userState, situation);
        const safety = this.buildSafetyFlags(input, userState);
        const trace = [
            `situation=${situation.kind}`,
            `emotion=${userState.emotion}`,
            `need=${userState.needMode}`,
            `strategy=${responseStrategy.primaryMode}/${responseStrategy.goal}`,
            `rhythm=${rhythm.pacing}/${rhythm.initiative}`,
        ];
        return {
            phasePlan: {
                phase1: 'foundation_runtime',
                phase2: 'growth_model',
                phase3: 'boundary_governance',
            },
            situation,
            userState,
            userModelDelta: this.buildUserModelDelta(userState, situation),
            responseStrategy,
            judgement,
            value,
            emotionRule,
            affinity,
            rhythm,
            relationship,
            safety,
            trace,
        };
    }
    recognizeSituation(input) {
        const text = input.userInput.trim();
        const intent = input.intentState;
        let kind = 'casual_chat';
        let confidence = 0.6;
        if (intent?.requiresTool) {
            kind = intent.mode === 'task' ? 'task_execution' : 'tool_request';
            confidence = 0.9;
        }
        else if (intent?.mode === 'thinking') {
            kind = 'co_thinking';
            confidence = 0.85;
        }
        else if (intent?.mode === 'decision') {
            kind = 'decision_support';
            confidence = 0.85;
        }
        else if (/(怎么办|该不该|要不要|怎么选|帮我看)/.test(text)) {
            kind = 'advice_request';
            confidence = 0.75;
        }
        else if (/(难受|崩溃|烦|累|委屈|焦虑|糟糕|想哭|不舒服)/.test(text)) {
            kind = 'emotional_expression';
            confidence = 0.8;
        }
        return {
            kind,
            confidence,
            requiresAction: kind !== 'casual_chat',
            summary: this.getSituationSummary(kind),
        };
    }
    static EMOTION_META = {
        calm: null,
        happy: { fragility: 'low', signal: 'positive-emotion' },
        low: { fragility: 'high', signal: 'low-mood-language' },
        anxious: { fragility: 'high', signal: 'anxious-language' },
        irritated: { fragility: 'medium', signal: 'irritated-language' },
        tired: { fragility: 'medium', signal: 'fatigue-language' },
        hurt: { fragility: 'high', signal: 'hurt-language' },
        excited: { fragility: 'low', signal: 'excited-language' },
    };
    detectUserState(input, situation) {
        const text = input.userInput;
        const signals = [];
        let emotion = 'calm';
        let needMode = 'companionship';
        let cognitiveLoad = 'low';
        let fragility = 'low';
        const sessionMood = input.sessionState?.mood?.toLowerCase();
        if (sessionMood && this.isKnownEmotion(sessionMood)) {
            emotion = sessionMood;
            const meta = CognitivePipelineService_1.EMOTION_META[emotion];
            if (meta) {
                fragility = meta.fragility;
                signals.push(meta.signal);
            }
            signals.push('emotion-source:session-state');
        }
        const llmEmotion = input.intentState?.detectedEmotion;
        if (llmEmotion && llmEmotion !== 'calm' && !sessionMood) {
            emotion = llmEmotion;
            const meta = CognitivePipelineService_1.EMOTION_META[llmEmotion];
            if (meta) {
                fragility = meta.fragility;
                signals.push(meta.signal);
            }
            signals.push('emotion-source:llm');
        }
        else if (!sessionMood) {
            if (/(开心|高兴|太好了|爽|好耶|激动)/.test(text)) {
                emotion = 'happy';
                signals.push('positive-emotion');
            }
            else if (/(焦虑|慌|担心|害怕|不安)/.test(text)) {
                emotion = 'anxious';
                fragility = 'high';
                signals.push('anxious-language');
            }
            else if (/(烦|气死|受不了|火大)/.test(text)) {
                emotion = 'irritated';
                fragility = 'medium';
                signals.push('irritated-language');
            }
            else if (/(累|困|撑不住|没电|疲惫)/.test(text)) {
                emotion = 'tired';
                fragility = 'medium';
                signals.push('fatigue-language');
            }
            else if (/(难过|委屈|失落|沮丧|想哭)/.test(text)) {
                emotion = 'low';
                fragility = 'high';
                signals.push('low-mood-language');
            }
            else if (/(受伤|被刺到|心里难受)/.test(text)) {
                emotion = 'hurt';
                fragility = 'high';
                signals.push('hurt-language');
            }
            else if (/(兴奋|上头|冲了|太想)/.test(text)) {
                emotion = 'excited';
                signals.push('excited-language');
            }
            if (emotion !== 'calm')
                signals.push('emotion-source:regex');
        }
        if (input.intentState?.requiresTool) {
            needMode = 'execution';
            cognitiveLoad = 'medium';
            signals.push('tool-intent');
        }
        else if (input.intentState?.mode === 'decision' || situation.kind === 'decision_support') {
            needMode = 'decision';
            cognitiveLoad = 'high';
            signals.push('decision-mode');
        }
        else if (input.intentState?.mode === 'thinking' || situation.kind === 'co_thinking') {
            needMode = 'co_thinking';
            cognitiveLoad = 'medium';
            signals.push('thinking-mode');
        }
        else if (situation.kind === 'advice_request') {
            needMode = 'advice';
            cognitiveLoad = 'medium';
            signals.push('advice-request');
        }
        else if (situation.kind === 'emotional_expression') {
            needMode = 'understanding';
            signals.push('needs-understanding');
        }
        if (text.length > 100 || /因为|但是|可是|一方面|另一方面|如果/.test(text)) {
            cognitiveLoad = cognitiveLoad === 'low' ? 'medium' : 'high';
            signals.push('complex-input');
        }
        const sessionEnergy = input.sessionState?.energy?.toLowerCase();
        if (sessionEnergy === 'low') {
            cognitiveLoad = 'high';
            fragility = fragility === 'low' ? 'medium' : fragility;
            signals.push('session-energy-low');
        }
        if (sessionEnergy === 'high' && cognitiveLoad === 'low') {
            signals.push('session-energy-high');
        }
        return {
            emotion,
            needMode,
            cognitiveLoad,
            fragility,
            signals,
        };
    }
    estimateRelationship(input) {
        const growthHints = input.growthContext?.relationshipNotes ?? [];
        if (growthHints.some((note) => note.includes('steady'))) {
            return { stage: 'steady', confidence: 0.82, rationale: ['persisted-relationship=steady'] };
        }
        if (growthHints.some((note) => note.includes('familiar'))) {
            return { stage: 'familiar', confidence: 0.7, rationale: ['persisted-relationship=familiar'] };
        }
        const userTurns = input.recentMessages.filter((m) => m.role === 'user').length;
        if (userTurns >= 12) {
            return { stage: 'steady', confidence: 0.75, rationale: ['recent-turns>=12'] };
        }
        if (userTurns >= 4) {
            return { stage: 'familiar', confidence: 0.6, rationale: ['recent-turns>=4'] };
        }
        return { stage: 'early', confidence: 0.45, rationale: ['recent-turns<4'] };
    }
    planResponseStrategy(input, situation, userState) {
        const base = (0, response_strategy_rules_1.resolveResponseStrategy)(input.intentState, situation, userState);
        return this.applyPolicySignals(base, input);
    }
    buildJudgementContext(input, userState, strategy) {
        const judgmentPatterns = input.growthContext?.judgmentPatterns ?? [];
        if (judgmentPatterns.some((note) => this.matchesAny(note, ['模板感', '过度追求完整', '先验证', '先校准']))) {
            return {
                style: 'gentle_realism',
                shouldChallengeContradiction: true,
            };
        }
        if (strategy.goal === 'move_decision') {
            return {
                style: 'gentle_realism',
                shouldChallengeContradiction: true,
            };
        }
        if (userState.fragility === 'high') {
            return {
                style: 'supportive_clarity',
                shouldChallengeContradiction: false,
            };
        }
        return {
            style: 'co_thinking',
            shouldChallengeContradiction: strategy.primaryMode !== 'empathize',
        };
    }
    buildValueContext(userState, input) {
        const priorities = ['truth_over_performance', 'user_context_over_generic_advice'];
        const growthProfiles = input.growthContext?.cognitiveProfiles ?? [];
        const valuePriorities = input.growthContext?.valuePriorities ?? [];
        if (userState.fragility === 'high') {
            priorities.unshift('stability_before_analysis');
        }
        else if (input.intentState?.mode === 'decision') {
            priorities.unshift('clarity_before_comfort');
        }
        else {
            priorities.unshift('authenticity_before_pleasing');
        }
        if (growthProfiles.some((note) => note.includes('先被理解'))) {
            priorities.splice(1, 0, 'understanding_before_solution');
        }
        if (valuePriorities.some((note) => this.matchesAny(note, ['真实感', '真实', '真诚']))) {
            priorities.unshift('authenticity_before_pleasing');
        }
        if (valuePriorities.some((note) => this.matchesAny(note, ['共创', '自主', '控制']))) {
            priorities.splice(1, 0, 'collaboration_before_control');
        }
        if (valuePriorities.some((note) => this.matchesAny(note, ['边界', '稳定', '安全感']))) {
            priorities.unshift('safety_before_speed');
        }
        return { priorities: Array.from(new Set(priorities)) };
    }
    buildEmotionContext(userState, input) {
        const emotionalClaims = (input.claimSignals ?? []).filter((c) => c.type === 'EMOTIONAL_TENDENCY');
        if (emotionalClaims.some((c) => this.matchesAny(`${c.key}:${c.value}`, ['安抚', '先共情', '先稳定']))) {
            return {
                rule: 'stabilize_first',
                responseOrder: ['acknowledge', 'stabilize', 'then_analyze_if_needed'],
            };
        }
        if (userState.emotion === 'happy' || userState.emotion === 'excited') {
            return {
                rule: 'amplify_positive',
                responseOrder: ['join_emotion', 'follow_topic'],
            };
        }
        if (userState.fragility === 'high') {
            return {
                rule: 'stabilize_first',
                responseOrder: ['acknowledge', 'stabilize', 'then_analyze_if_needed'],
            };
        }
        if (userState.needMode === 'companionship') {
            return {
                rule: 'keep_light',
                responseOrder: ['stay_present', 'follow_topic'],
            };
        }
        return {
            rule: 'analyze_after_empathy',
            responseOrder: ['acknowledge', 'analyze'],
        };
    }
    buildAffinityContext(userState, relationship) {
        if (userState.fragility === 'high') {
            return {
                mode: 'gentle_distance',
                allowLightTease: false,
            };
        }
        if (relationship.stage === 'steady') {
            return {
                mode: 'warmer',
                allowLightTease: true,
            };
        }
        return {
            mode: 'steady',
            allowLightTease: false,
        };
    }
    buildRhythmContext(input, strategy, userState, situation) {
        const rhythmPatterns = input.growthContext?.rhythmPatterns ?? [];
        const pacing = strategy.depth === 'deep'
            ? 'expanded'
            : strategy.depth === 'medium'
                ? 'balanced'
                : 'short';
        if (userState.fragility === 'high') {
            return {
                pacing: 'short',
                shouldAskFollowup: false,
                initiative: 'hold',
            };
        }
        if (strategy.primaryMode === 'reflect' || strategy.primaryMode === 'clarify') {
            const shouldHoldSpace = rhythmPatterns.some((note) => this.matchesAny(note, ['先别追问', '先消化', '慢一点', '留白']));
            return {
                pacing: shouldHoldSpace ? 'short' : pacing,
                shouldAskFollowup: !shouldHoldSpace,
                initiative: shouldHoldSpace ? 'hold' : 'nudge',
            };
        }
        if (strategy.primaryMode === 'decide') {
            const prefersArchitectureFirst = rhythmPatterns.some((note) => this.matchesAny(note, ['先转为架构思考', '先看结构', '先搭框架']));
            return {
                pacing: prefersArchitectureFirst ? 'expanded' : pacing,
                shouldAskFollowup: false,
                initiative: 'guide',
            };
        }
        if (situation?.kind === 'casual_chat') {
            return {
                pacing,
                shouldAskFollowup: false,
                initiative: 'nudge',
            };
        }
        return {
            pacing,
            shouldAskFollowup: false,
            initiative: 'hold',
        };
    }
    buildSafetyFlags(input, userState) {
        const notes = [];
        const capabilityBoundaryRisk = /你帮我做了吧|你已经发了|你替我决定/.test(input.userInput);
        const relationalBoundaryRisk = userState.fragility === 'high';
        const truthBoundaryRisk = /一定|绝对|百分百/.test(input.userInput);
        const priorBoundaryNotes = input.growthContext?.boundaryNotes ?? [];
        if (capabilityBoundaryRisk)
            notes.push('verify-capability-before-claiming');
        if (relationalBoundaryRisk)
            notes.push('avoid-pressure-or-guilt');
        if (truthBoundaryRisk)
            notes.push('avoid-overstating-certainty');
        if (priorBoundaryNotes.length > 0)
            notes.push('respect-known-boundary-patterns');
        return {
            capabilityBoundaryRisk,
            relationalBoundaryRisk,
            truthBoundaryRisk,
            notes,
        };
    }
    buildUserModelDelta(userState, situation) {
        const rationale = [];
        const shouldWriteCognitive = situation.kind === 'decision_support' || situation.kind === 'co_thinking';
        const shouldWriteRelationship = userState.fragility === 'high' || userState.needMode === 'understanding';
        const shouldWriteProfile = false;
        if (shouldWriteCognitive)
            rationale.push('repeated decisions and thinking patterns are growth candidates');
        if (shouldWriteRelationship)
            rationale.push('high-fragility turns may matter for rhythm and repair');
        return {
            shouldWriteProfile,
            shouldWriteCognitive,
            shouldWriteRelationship,
            rationale,
        };
    }
    getSituationSummary(kind) {
        switch (kind) {
            case 'emotional_expression':
                return '用户主要在表达状态，需要先承接。';
            case 'co_thinking':
                return '用户希望一起梳理想法。';
            case 'decision_support':
                return '用户在多选项之间接近定型，需要推进决策。';
            case 'advice_request':
                return '用户在要建议，但未必需要立即下结论。';
            case 'tool_request':
                return '用户在请求工具能力。';
            case 'task_execution':
                return '用户希望直接执行任务。';
            case 'casual_chat':
            default:
                return '用户当前主要是自然聊天。';
        }
    }
    matchesAny(text, patterns) {
        return patterns.some((pattern) => text.includes(pattern));
    }
    applyPolicySignals(strategy, input) {
        const next = { ...strategy };
        const sessionEnergy = input.sessionState?.energy?.toLowerCase();
        if (sessionEnergy === 'low') {
            next.depth = 'brief';
            next.initiative = 'passive';
        }
        const interactionClaims = (input.claimSignals ?? []).filter((c) => c.type === 'INTERACTION_PREFERENCE');
        for (const claim of interactionClaims) {
            const text = `${claim.key}:${claim.value}`;
            if (this.matchesAny(text, ['short', '简短', '先结论'])) {
                next.depth = 'brief';
            }
            if (this.matchesAny(text, ['结构化', '分点', '清单'])) {
                next.goal = next.goal === 'stabilize_user' ? 'build_understanding' : next.goal;
            }
            if (this.matchesAny(text, ['不要追问', '少追问'])) {
                next.initiative = 'passive';
            }
        }
        return next;
    }
    isKnownEmotion(value) {
        return (value === 'calm'
            || value === 'happy'
            || value === 'low'
            || value === 'anxious'
            || value === 'irritated'
            || value === 'tired'
            || value === 'hurt'
            || value === 'excited');
    }
};
exports.CognitivePipelineService = CognitivePipelineService;
exports.CognitivePipelineService = CognitivePipelineService = CognitivePipelineService_1 = __decorate([
    (0, common_1.Injectable)()
], CognitivePipelineService);
//# sourceMappingURL=cognitive-pipeline.service.js.map