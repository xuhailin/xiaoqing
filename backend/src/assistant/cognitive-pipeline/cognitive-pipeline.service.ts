import { Injectable } from '@nestjs/common';
import type {
  AffinityContext,
  CognitiveTurnInput,
  CognitiveTurnState,
  EmotionContext,
  FragilityLevel,
  JudgementContext,
  RelationshipContext,
  ResponseStrategy,
  RhythmContext,
  SafetyFlags,
  SocialRelationSignal,
  SituationKind,
  SituationRecognition,
  UserEmotion,
  UserNeedMode,
  UserState,
  ValueContext,
} from './cognitive-pipeline.types';
import { resolveResponseStrategy } from './response-strategy-rules';

@Injectable()
export class CognitivePipelineService {
  analyzeTurn(input: CognitiveTurnInput): CognitiveTurnState {
    const situation = this.recognizeSituation(input);
    const userState = this.detectUserState(input, situation);
    const relationship = this.estimateRelationship(input);
    const responseStrategy = this.planResponseStrategy(input, situation, userState);
    const judgement = this.buildJudgementContext(input, userState, responseStrategy);
    const value = this.buildValueContext(userState, input);
    const emotionRule = this.buildEmotionContext(userState, input);
    const affinity = this.buildAffinityContext(userState, relationship);
    const rhythm = this.buildRhythmContext(input, responseStrategy, userState, situation);
    const safety = this.buildSafetyFlags(input, userState, situation);

    const trace = [
      `situation=${situation.kind}`,
      `emotion=${userState.emotion}`,
      `need=${userState.needMode}`,
      `strategy=${responseStrategy.primaryMode}/${responseStrategy.goal}`,
      `rhythm=${rhythm.pacing}/${rhythm.initiative}`,
      ...(input.emotionTrend?.dominantEmotion
        ? [`emotion-trend=${input.emotionTrend.dominantEmotion}/${input.emotionTrend.recentTrend ?? 'stable'}`]
        : []),
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

  private recognizeSituation(input: CognitiveTurnInput): SituationRecognition {
    const text = input.userInput.trim();
    const intent = input.intentState;
    const relationDistress = this.detectRelationshipDistress(input);
    let kind: SituationKind = 'casual_chat';
    let confidence = 0.6;
    let summary = this.getSituationSummary('casual_chat');

    if (intent?.requiresTool) {
      kind = intent.mode === 'task' ? 'task_execution' : 'tool_request';
      confidence = 0.9;
    } else if (intent?.mode === 'thinking') {
      kind = 'co_thinking';
      confidence = 0.85;
    } else if (intent?.mode === 'decision') {
      kind = 'decision_support';
      confidence = 0.85;
    } else if (relationDistress) {
      kind = 'relationship_distress';
      confidence = relationDistress.confidence;
      summary = relationDistress.summary;
    } else if (/(怎么办|该不该|要不要|怎么选|帮我看)/.test(text)) {
      kind = 'advice_request';
      confidence = 0.75;
    } else if (/(难受|崩溃|烦|累|委屈|焦虑|糟糕|想哭|不舒服)/.test(text)) {
      kind = 'emotional_expression';
      confidence = 0.8;
    }

    if (!relationDistress || kind !== 'relationship_distress') {
      summary = this.getSituationSummary(kind);
    }

    return {
      kind,
      confidence,
      requiresAction: kind !== 'casual_chat',
      summary,
    };
  }

  /** 情绪→脆弱度/信号映射表 */
  private static readonly EMOTION_META: Record<UserEmotion, { fragility: FragilityLevel; signal: string } | null> = {
    calm: null,
    happy: { fragility: 'low', signal: 'positive-emotion' },
    low: { fragility: 'high', signal: 'low-mood-language' },
    anxious: { fragility: 'high', signal: 'anxious-language' },
    irritated: { fragility: 'medium', signal: 'irritated-language' },
    tired: { fragility: 'medium', signal: 'fatigue-language' },
    hurt: { fragility: 'high', signal: 'hurt-language' },
    excited: { fragility: 'low', signal: 'excited-language' },
  };

  private detectUserState(
    input: CognitiveTurnInput,
    situation: SituationRecognition,
  ): UserState {
    const text = input.userInput;
    const signals: string[] = [];
    let emotion: UserEmotion = 'calm';
    let needMode: UserNeedMode = 'companionship';
    let cognitiveLoad: UserState['cognitiveLoad'] = 'low';
    let fragility: FragilityLevel = 'low';

    const sessionMood = input.sessionState?.mood?.toLowerCase();
    if (sessionMood && this.isKnownEmotion(sessionMood)) {
      emotion = sessionMood;
      const meta = CognitivePipelineService.EMOTION_META[emotion];
      if (meta) {
        fragility = meta.fragility;
        signals.push(meta.signal);
      }
      signals.push('emotion-source:session-state');
    }

    // 优先使用 LLM 推断的情绪（intent_v9+）
    const llmEmotion = input.intentState?.detectedEmotion;
    if (llmEmotion && llmEmotion !== 'calm' && !sessionMood) {
      emotion = llmEmotion;
      const meta = CognitivePipelineService.EMOTION_META[llmEmotion];
      if (meta) {
        fragility = meta.fragility;
        signals.push(meta.signal);
      }
      signals.push('emotion-source:llm');
    } else if (!sessionMood) {
      // Fallback: regex 关键词匹配
      if (/(开心|高兴|太好了|爽|好耶|激动)/.test(text)) {
        emotion = 'happy';
        signals.push('positive-emotion');
      } else if (/(焦虑|慌|担心|害怕|不安)/.test(text)) {
        emotion = 'anxious';
        fragility = 'high';
        signals.push('anxious-language');
      } else if (/(烦|气死|受不了|火大)/.test(text)) {
        emotion = 'irritated';
        fragility = 'medium';
        signals.push('irritated-language');
      } else if (/(累|困|撑不住|没电|疲惫)/.test(text)) {
        emotion = 'tired';
        fragility = 'medium';
        signals.push('fatigue-language');
      } else if (/(难过|委屈|失落|沮丧|想哭)/.test(text)) {
        emotion = 'low';
        fragility = 'high';
        signals.push('low-mood-language');
      } else if (/(受伤|被刺到|心里难受)/.test(text)) {
        emotion = 'hurt';
        fragility = 'high';
        signals.push('hurt-language');
      } else if (/(兴奋|上头|冲了|太想)/.test(text)) {
        emotion = 'excited';
        signals.push('excited-language');
      }
      if (emotion !== 'calm') signals.push('emotion-source:regex');
    }

    if (input.intentState?.requiresTool) {
      needMode = 'execution';
      cognitiveLoad = 'medium';
      signals.push('tool-intent');
    } else if (input.intentState?.mode === 'decision' || situation.kind === 'decision_support') {
      needMode = 'decision';
      cognitiveLoad = 'high';
      signals.push('decision-mode');
    } else if (input.intentState?.mode === 'thinking' || situation.kind === 'co_thinking') {
      needMode = 'co_thinking';
      cognitiveLoad = 'medium';
      signals.push('thinking-mode');
    } else if (situation.kind === 'advice_request') {
      needMode = 'advice';
      cognitiveLoad = 'medium';
      signals.push('advice-request');
    } else if (situation.kind === 'relationship_distress') {
      needMode = 'understanding';
      cognitiveLoad = 'medium';
      fragility = fragility === 'low' ? 'medium' : fragility;
      signals.push('relationship-distress');
    } else if (situation.kind === 'emotional_expression') {
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

    if (input.emotionTrend?.fragileRisk && fragility === 'low') {
      fragility = 'medium';
      signals.push('emotion-history:fragile-risk');
    }

    if (
      emotion === 'calm'
      && input.emotionTrend?.dominantEmotion
      && input.emotionTrend.dominantEmotion !== 'calm'
    ) {
      signals.push(`emotion-history:dominant-${input.emotionTrend.dominantEmotion}`);
    }

    if (input.emotionTrend?.recentTrend === 'declining' && fragility === 'low') {
      fragility = 'medium';
      signals.push('emotion-history:declining-trend');
    }

    return {
      emotion,
      needMode,
      cognitiveLoad,
      fragility,
      signals,
    };
  }

  private estimateRelationship(input: CognitiveTurnInput): RelationshipContext {
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

  private planResponseStrategy(
    input: CognitiveTurnInput,
    situation: SituationRecognition,
    userState: UserState,
  ): ResponseStrategy {
    const base = resolveResponseStrategy(input.intentState, situation, userState);
    return this.applyPolicySignals(base, input);
  }

  private buildJudgementContext(
    input: CognitiveTurnInput,
    userState: UserState,
    strategy: ResponseStrategy,
  ): JudgementContext {
    const judgmentPatterns = input.growthContext?.judgmentPatterns ?? [];

    if (
      judgmentPatterns.some((note) =>
        this.matchesAny(note, ['模板感', '过度追求完整', '先验证', '先校准']),
      )
    ) {
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

  private buildValueContext(userState: UserState, input: CognitiveTurnInput): ValueContext {
    const priorities = ['truth_over_performance', 'user_context_over_generic_advice'];
    const growthProfiles = input.growthContext?.cognitiveProfiles ?? [];
    const valuePriorities = input.growthContext?.valuePriorities ?? [];

    if (userState.fragility === 'high') {
      priorities.unshift('stability_before_analysis');
    } else if (input.intentState?.mode === 'decision') {
      priorities.unshift('clarity_before_comfort');
    } else {
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

  private buildEmotionContext(
    userState: UserState,
    input: CognitiveTurnInput,
  ): EmotionContext {
    const emotionalClaims = (input.claimSignals ?? []).filter(
      (c) => c.type === 'EMOTIONAL_TENDENCY',
    );

    if (
      emotionalClaims.some((c) => this.matchesAny(`${c.key}:${c.value}`, ['安抚', '先共情', '先稳定']))
    ) {
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

  private buildAffinityContext(
    userState: UserState,
    relationship: RelationshipContext,
  ): AffinityContext {
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

  private buildRhythmContext(
    input: CognitiveTurnInput,
    strategy: ResponseStrategy,
    userState: UserState,
    situation?: SituationRecognition,
  ): RhythmContext {
    const rhythmPatterns = input.growthContext?.rhythmPatterns ?? [];
    const pacing: RhythmContext['pacing'] =
      strategy.depth === 'deep'
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
      const shouldHoldSpace = rhythmPatterns.some((note) =>
        this.matchesAny(note, ['先别追问', '先消化', '慢一点', '留白']),
      );
      return {
        pacing: shouldHoldSpace ? 'short' : pacing,
        shouldAskFollowup: !shouldHoldSpace,
        initiative: shouldHoldSpace ? 'hold' : 'nudge',
      };
    }

    if (strategy.primaryMode === 'decide') {
      const prefersArchitectureFirst = rhythmPatterns.some((note) =>
        this.matchesAny(note, ['先转为架构思考', '先看结构', '先搭框架']),
      );
      return {
        pacing: prefersArchitectureFirst ? 'expanded' : pacing,
        shouldAskFollowup: false,
        initiative: 'guide',
      };
    }

    if (situation?.kind === 'relationship_distress') {
      return {
        pacing: pacing === 'expanded' ? 'balanced' : pacing,
        shouldAskFollowup: userState.fragility === 'low',
        initiative: userState.fragility === 'low' ? 'nudge' : 'hold',
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

  private buildSafetyFlags(
    input: CognitiveTurnInput,
    userState: UserState,
    situation: SituationRecognition,
  ): SafetyFlags {
    const notes: string[] = [];
    const capabilityBoundaryRisk = /你帮我做了吧|你已经发了|你替我决定/.test(input.userInput);
    const relationalBoundaryRisk =
      userState.fragility === 'high' || situation.kind === 'relationship_distress';
    const truthBoundaryRisk = /一定|绝对|百分百/.test(input.userInput);
    const priorBoundaryNotes = input.growthContext?.boundaryNotes ?? [];

    if (capabilityBoundaryRisk) notes.push('verify-capability-before-claiming');
    if (relationalBoundaryRisk) notes.push('avoid-pressure-or-guilt');
    if (situation.kind === 'relationship_distress') notes.push('avoid-taking-sides-too-fast');
    if (truthBoundaryRisk) notes.push('avoid-overstating-certainty');
    if (priorBoundaryNotes.length > 0) notes.push('respect-known-boundary-patterns');

    return {
      capabilityBoundaryRisk,
      relationalBoundaryRisk,
      truthBoundaryRisk,
      notes,
    };
  }

  private buildUserModelDelta(
    userState: UserState,
    situation: SituationRecognition,
  ): CognitiveTurnState['userModelDelta'] {
    const rationale: string[] = [];
    const shouldWriteCognitive =
      situation.kind === 'decision_support' || situation.kind === 'co_thinking';
    const shouldWriteRelationship =
      userState.fragility === 'high'
      || userState.needMode === 'understanding'
      || situation.kind === 'relationship_distress';
    const shouldWriteProfile = false;

    if (shouldWriteCognitive) rationale.push('repeated decisions and thinking patterns are growth candidates');
    if (shouldWriteRelationship) rationale.push('high-fragility turns may matter for rhythm and repair');

    return {
      shouldWriteProfile,
      shouldWriteCognitive,
      shouldWriteRelationship,
      rationale,
    };
  }

  private getSituationSummary(kind: SituationKind): string {
    switch (kind) {
      case 'emotional_expression':
        return '用户主要在表达状态，需要先承接。';
      case 'relationship_distress':
        return '用户可能在谈一段关系里的卡点，需要先承接再慢慢梳理。';
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

  private matchesAny(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
  }

  private detectRelationshipDistress(input: CognitiveTurnInput): {
    confidence: number;
    summary: string;
  } | null {
    const text = input.userInput.trim().toLowerCase();
    if (!text) return null;

    const matchedSignal = this.findMentionedRelationSignal(text, input.socialContext?.relationSignals ?? []);
    const hasDirectDistressLanguage =
      /(吵架|冷战|疏远|闹僵|失望|不理|矛盾|别扭|难相处|沟通不了|闹翻|关系不好|相处得很累)/.test(text);
    const hasImplicitStrain =
      /(最近|又|还是|一直|总是|不回我|没理我|不知道怎么面对|不知道怎么聊|有点尴尬)/.test(text);

    if (!hasDirectDistressLanguage && !(matchedSignal && hasImplicitStrain)) {
      return null;
    }

    if (matchedSignal) {
      return {
        confidence: hasDirectDistressLanguage ? 0.88 : 0.76,
        summary: `用户可能在谈和${matchedSignal.entityName}的关系卡点，需要先承接，再视情况一起梳理。`,
      };
    }

    return {
      confidence: 0.78,
      summary: '用户可能在谈一段让自己有压力的人际关系，需要先承接，再视情况一起梳理。',
    };
  }

  private findMentionedRelationSignal(
    text: string,
    relationSignals: SocialRelationSignal[],
  ): SocialRelationSignal | null {
    for (const signal of relationSignals) {
      const names = [signal.entityName, ...signal.entityAliases]
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      if (names.some((name) => text.includes(name))) {
        return signal;
      }
    }
    return null;
  }

  private applyPolicySignals(
    strategy: ResponseStrategy,
    input: CognitiveTurnInput,
  ): ResponseStrategy {
    const next: ResponseStrategy = { ...strategy };
    const sessionEnergy = input.sessionState?.energy?.toLowerCase();
    if (sessionEnergy === 'low') {
      next.depth = 'brief';
      next.initiative = 'passive';
    }

    const interactionClaims = (input.claimSignals ?? []).filter(
      (c) => c.type === 'INTERACTION_PREFERENCE',
    );
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

  private isKnownEmotion(value: string): value is UserEmotion {
    return (
      value === 'calm'
      || value === 'happy'
      || value === 'low'
      || value === 'anxious'
      || value === 'irritated'
      || value === 'tired'
      || value === 'hurt'
      || value === 'excited'
    );
  }
}
