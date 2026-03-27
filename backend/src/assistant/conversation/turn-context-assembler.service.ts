import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { PersonaService } from '../persona/persona.service';
import { PersonaRuleService } from '../persona/persona-rule.service';
import { UserProfileService } from '../persona/user-profile.service';
import { IdentityAnchorService } from '../identity-anchor/identity-anchor.service';
import { WorldStateService } from '../../infra/world-state/world-state.service';
import { CognitiveGrowthService } from '../cognitive-pipeline/cognitive-growth.service';
import { EmotionHistoryService } from '../memory/emotion-history.service';
import { MemoryService, type MemoryCandidate } from '../memory/memory.service';
import { MEMORY_RECALLER_TOKEN, type IMemoryRecaller } from '../memory/memory-recaller.interface';
import { PromptRouterService } from '../prompt-router/prompt-router.service';
import { IntentService } from '../intent/intent.service';
import type { DialogueIntentState } from '../intent/intent.types';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import { ClaimEngineConfig } from '../claim-engine/claim-engine.config';
import { ClaimSelectorService } from '../claim-engine/claim-selector.service';
import { SessionStateService } from '../claim-engine/session-state.service';
import { estimateTokens } from '../../infra/token-estimator';
import { FeatureFlagConfig } from './feature-flag.config';
import { SystemSelfService } from '../../system-self/system-self.service';
import type { TurnContext } from './orchestration.types';
import { SharedExperienceService } from '../shared-experience/shared-experience.service';
import { SessionReflectionService } from '../session-reflection/session-reflection.service';
import { SocialEntityService } from '../life-record/social-entity/social-entity.service';
import { SocialInsightService } from '../life-record/social-insight/social-insight.service';
import { SocialRelationEdgeService } from '../life-record/social-relation-edge/social-relation-edge.service';
import type { CollaborationTurnContext } from './orchestration.types';
import type { QuickRouterOutput } from './quick-intent-router.types';

/**
 * TurnContextAssembler - 感知层上下文组装器
 *
 * 所属层：
 *  - Perception
 *
 * 负责：
 *  - 汇总消息、记忆、画像、世界状态、社交上下文等感知输入
 *  - 产出供主链路继续消费的 TurnContext 与意图补全结果
 *
 * 不负责：
 *  - 不做最终行动决策
 *  - 不执行 capability / tool
 *  - 不直接生成最终回复文本
 *
 * 输入：
 *  - conversationId、userInput、userMessage、quickRoute、协作上下文
 *
 * 输出：
 *  - TurnContext
 *
 * ⚠️ 约束：
 *  - 只负责感知态组装，不得继续承接决策或表达逻辑
 *  - chat 上下文读取边界必须遵守 docs/context-boundary.md
 */
@Injectable()
export class TurnContextAssembler {
  private readonly logger = new Logger(TurnContextAssembler.name);

  private static readonly IDENTITY_LABEL_MAP: Record<string, string> = {
    city: 'location',
    timezone: 'timezone',
    language: 'language',
    conversationMode: 'custom',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly persona: PersonaService,
    private readonly personaRules: PersonaRuleService,
    private readonly userProfile: UserProfileService,
    private readonly identityAnchor: IdentityAnchorService,
    private readonly worldState: WorldStateService,
    private readonly cognitiveGrowth: CognitiveGrowthService,
    private readonly emotionHistory: EmotionHistoryService,
    @Inject(MEMORY_RECALLER_TOKEN)
    private readonly memoryRecaller: IMemoryRecaller,
    private readonly memoryService: MemoryService,
    private readonly router: PromptRouterService,
    private readonly intent: IntentService,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly claimConfig: ClaimEngineConfig,
    private readonly claimSelector: ClaimSelectorService,
    private readonly sessionStateStore: SessionStateService,
    private readonly flags: FeatureFlagConfig,
    private readonly systemSelf: SystemSelfService,
    private readonly sharedExperience: SharedExperienceService,
    private readonly sessionReflection: SessionReflectionService,
    private readonly socialEntity: SocialEntityService,
    private readonly socialInsight: SocialInsightService,
    private readonly socialRelationEdge: SocialRelationEdgeService,
  ) {}

  async assemble(input: {
    conversationId: string;
    userId: string;
    userInput: string;
    userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    now: Date;
    recentRounds: number;
    quickRoute?: QuickRouterOutput | null;
    collaborationContext?: CollaborationTurnContext | null;
  }): Promise<TurnContext> {
    const [recentRaw, profile, anchors, storedWorldState, growthContext, systemSelf] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(0, input.recentRounds) * 2,
      }),
      this.userProfile.getOrCreate(input.userId),
      this.identityAnchor.getActiveAnchors(input.userId),
      this.worldState.get(input.conversationId),
      this.cognitiveGrowth.getGrowthContext(input.userId),
      this.systemSelf.getSystemSelf('chat'),
    ]);

    const personaDto = await this.persona.getOrCreate(profile.preferredPersonaKey);

    const recentMessages = recentRaw.reverse().map((m) => ({ role: m.role, content: m.content }));
    const anchorText = this.identityAnchor.buildAnchorText(anchors);
    const anchorCity = anchors.find((a) => a.label === 'location')?.content?.trim() || undefined;
    const defaultWorldState = anchorCity && !storedWorldState?.city
      ? { ...(storedWorldState ?? {}), city: anchorCity }
      : storedWorldState;

    const [preferredNickname, interactionTuning] = await Promise.all([
      this.readPreferredNickname(input.userId),
      this.readInteractionTuning(input.userId),
    ]);
    const memoryCtx = await this.recallMemories(
      input.conversationId,
      input.userId,
      recentMessages,
      personaDto,
      profile,
      input.quickRoute,
    );
    const intentCtx = await this.resolveIntent({
      conversationId: input.conversationId,
      userId: input.userId,
      userInput: input.userInput,
      recentMessages,
      defaultWorldState,
      anchorCity,
      quickRoute: input.quickRoute,
      now: input.now,
    });

    const resolvedIntent = intentCtx.mergedIntentState ?? intentCtx.intentState;
    const fullWorldState = intentCtx.worldState ?? storedWorldState;
    const [claimCtx, emotionTrend] = await Promise.all([
      this.buildClaimAndSessionContext(input.userId, input.conversationId),
      this.emotionHistory.getRecentTrend(input.conversationId),
    ]);
    const assemblyMode = input.quickRoute?.path === 'tool'
      ? 'tool'
      : input.quickRoute?.path === 'chat'
        ? 'chat'
        : 'full';
    const shouldSkipSocialRelationship = assemblyMode !== 'full';

    let relationshipCtx: TurnContext['relationship'];
    let socialCtx: TurnContext['social'];

    if (shouldSkipSocialRelationship) {
      // tool/capability (run_capability) reply prompt doesn't consume these blocks.
      relationshipCtx = { sharedExperiences: [], rhythmObservations: [] };
      socialCtx = { entities: [], insights: [], relationSignals: [] };
    } else {
      relationshipCtx = await this.buildRelationshipContext({
        conversationId: input.conversationId,
        userId: input.userId,
        userInput: input.userInput,
        recentMessages,
      });
      socialCtx = await this.buildSocialContext({
        userId: input.userId,
        userInput: input.userInput,
        recentMessages,
      });
    }

    // 读取上一轮的反思结果
    let previousReflection: { quality: 'good' | 'suboptimal' | 'failed'; adjustmentHint: string; timestamp: Date } | undefined;
    try {
      const sessionState = await this.sessionStateStore.getFreshState(input.userId, input.conversationId);
      if (sessionState?.stateJson?.lastReflection) {
        const lr = sessionState.stateJson.lastReflection as any;
        if (lr.quality && lr.adjustmentHint && lr.timestamp) {
          previousReflection = {
            quality: lr.quality,
            adjustmentHint: lr.adjustmentHint,
            timestamp: new Date(lr.timestamp),
          };
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to load previous reflection: ${String(err)}`);
    }

    const expressionFields = await this.resolveExpressionFields(personaDto);

    return {
      request: {
        conversationId: input.conversationId,
        userId: input.userId,
        now: input.now,
        userInput: input.userInput,
        userMessage: input.userMessage,
      },
      conversation: { recentMessages },
      persona: {
        personaDto,
        expressionFields,
        metaFilterPolicy: personaDto.metaFilterPolicy ?? null,
      },
      user: {
        userProfile: profile,
        identityAnchors: anchors,
        anchorText,
        ...(anchorCity ? { anchorCity } : {}),
        preferredNickname,
        ...(interactionTuning?.length ? { interactionTuning } : {}),
      },
      world: { storedWorldState, defaultWorldState, fullWorldState },
      memory: memoryCtx,
      growth: { growthContext },
      relationship: relationshipCtx,
      social: socialCtx,
      claims: claimCtx,
      system: { systemSelf },
      runtime: {
        intentState: intentCtx.intentState,
        mergedIntentState: intentCtx.mergedIntentState,
        quickRoute: input.quickRoute ?? null,
        collaborationContext: input.collaborationContext ?? null,
        emotionTrend,
        memoryRecall: {
          strategy: memoryCtx.strategy,
          candidatesCount: memoryCtx.candidatesCount,
          selectedCount: memoryCtx.injectedMemories.length,
          needDetail: memoryCtx.needDetail,
        },
        ...(previousReflection ? { previousReflection } : {}),
      },
    };
  }

  async assembleFallback(input: {
    conversationId: string;
    userId: string;
    userInput: string;
    userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    now: Date;
    recentRounds: number;
    quickRoute?: QuickRouterOutput | null;
    collaborationContext?: CollaborationTurnContext | null;
  }): Promise<TurnContext> {
    const [recentRaw, profile, anchors, storedWorldState, growthContext, systemSelf] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(0, input.recentRounds) * 2,
      }),
      this.userProfile.getOrCreate(input.userId),
      this.identityAnchor.getActiveAnchors(input.userId),
      this.worldState.get(input.conversationId),
      this.cognitiveGrowth.getGrowthContext(input.userId),
      this.systemSelf.getSystemSelf('chat'),
    ]);

    const personaDto = await this.persona.getOrCreate(profile.preferredPersonaKey);

    const recentMessages = recentRaw.reverse().map((m) => ({ role: m.role, content: m.content }));
    const anchorText = this.identityAnchor.buildAnchorText(anchors);
    const anchorCity = anchors.find((a) => a.label === 'location')?.content?.trim() || undefined;
    const defaultWorldState = anchorCity && !storedWorldState?.city
      ? { ...(storedWorldState ?? {}), city: anchorCity }
      : storedWorldState;

    const [preferredNickname, interactionTuningFb] = await Promise.all([
      this.readPreferredNickname(input.userId),
      this.readInteractionTuning(input.userId),
    ]);

    const expressionFieldsFb = await this.resolveExpressionFields(personaDto);
    const fallbackEmotionTrend = await this.emotionHistory.getRecentTrend(input.conversationId);

    return {
      request: { ...input },
      conversation: { recentMessages },
      persona: {
        personaDto,
        expressionFields: expressionFieldsFb,
        metaFilterPolicy: personaDto.metaFilterPolicy ?? null,
      },
      user: {
        userProfile: profile,
        identityAnchors: anchors,
        anchorText,
        ...(anchorCity ? { anchorCity } : {}),
        preferredNickname,
        ...(interactionTuningFb?.length ? { interactionTuning: interactionTuningFb } : {}),
      },
      world: { storedWorldState, defaultWorldState, fullWorldState: storedWorldState },
      memory: {
        strategy: this.memoryRecaller.getStrategyName?.() ?? 'keyword',
        injectedMemories: [],
        candidatesCount: 0,
        needDetail: false,
        memoryBudgetTokens: 0,
      },
      growth: { growthContext },
      relationship: { sharedExperiences: [], rhythmObservations: [] },
      social: { entities: [], insights: [], relationSignals: [] },
      claims: {
        claimSignals: [],
        claimPolicyText: '',
        sessionState: null,
        sessionStateText: '',
        injectedClaimsDebug: [],
        draftClaimsDebug: [],
      },
      system: { systemSelf },
      runtime: {
        quickRoute: input.quickRoute ?? null,
        collaborationContext: input.collaborationContext ?? null,
        emotionTrend: fallbackEmotionTrend,
        memoryRecall: {
          strategy: this.memoryRecaller.getStrategyName?.() ?? 'keyword',
          candidatesCount: 0,
          selectedCount: 0,
          needDetail: false,
        },
      },
    };
  }

  /**
   * 读取 pa.* (INTERACTION_TUNING) claims，产出长期互动调谐信号。
   * 不走主 claim token budget，独立查询。
   * 只取成熟态（WEAK / STABLE / CORE）且 confidence >= 0.6 的条目。
   * CANDIDATE 状态仅用于观察/累积证据，不参与互动调谐派生与表达控制。
   */
  private async readInteractionTuning(userId: string): Promise<TurnContext['user']['interactionTuning']> {
    try {
      const rows = await this.prisma.userClaim.findMany({
        where: {
          userKey: userId,
          type: 'INTERACTION_TUNING',
          confidence: { gte: 0.6 },
          status: { in: ['WEAK', 'STABLE', 'CORE'] },
        },
        orderBy: { confidence: 'desc' },
      });
      if (!rows.length) return undefined;
      return rows.map((r) => ({
        key: r.key,
        value: r.valueJson,
        confidence: r.confidence,
      }));
    } catch (err) {
      this.logger.warn(`readInteractionTuning failed: ${String(err)}`);
      return undefined;
    }
  }

  private async resolveExpressionFields(
    personaDto: TurnContext['persona']['personaDto'],
  ): Promise<TurnContext['persona']['expressionFields']> {
    await this.personaRules.ensureInitialized(personaDto.expressionRules);
    const prompt = await this.personaRules.buildExpressionPrompt();
    if (prompt?.trim()) {
      return { expressionRules: prompt };
    }
    return this.persona.getExpressionFields(personaDto);
  }

  /**
   * 读取用户”首选昵称”并放宽 Claim 状态过滤，确保首次写入（CANDIDATE）也能立即注入。
   */
  private async readPreferredNickname(userId: string): Promise<string | null> {
    try {
      const claim = await this.prisma.userClaim.findFirst({
        where: {
          userKey: userId,
          type: 'INTERACTION_PREFERENCE',
          key: 'ip.nickname.primary',
          confidence: { gte: 0.7 },
          status: { not: 'DEPRECATED' },
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (!claim) return null;

      const val = claim.valueJson as { name?: string } | null;
      const name = typeof val?.name === 'string' ? val.name.trim() : '';
      return name || null;
    } catch (err: unknown) {
      this.logger.warn(`readPreferredNickname failed: ${String(err)}`);
      return null;
    }
  }

  private async resolveIntent(input: {
    conversationId: string;
    userId: string;
    userInput: string;
    recentMessages: Array<{ role: string; content: string }>;
    defaultWorldState: TurnContext['world']['defaultWorldState'];
    anchorCity?: string;
    quickRoute?: QuickRouterOutput | null;
    now: Date;
  }): Promise<{
    intentState: DialogueIntentState | null;
    mergedIntentState: DialogueIntentState | null;
    /** resolveIntent 期望返回更新后的最新 worldState（DB persisted state，不含 fallback） */
    worldState: TurnContext['world']['fullWorldState'];
  }> {
    const hasAnyChatCapability =
      this.flags.featureOpenClaw ||
      this.capabilityRegistry.listExposed('chat', { surface: 'assistant' }).length > 0;
    if (!hasAnyChatCapability) {
      const worldState = await this.worldState.get(input.conversationId);
      return { intentState: null, mergedIntentState: null, worldState };
    }

    try {
      const quickRoute = input.quickRoute;
      const shouldBypassIntentLlm =
        quickRoute?.path === 'tool'
        && !!quickRoute.toolHint
        && quickRoute.confidence >= 0.9;

      const intentState = shouldBypassIntentLlm
        ? this.intent.fromHint({
            toolHint: quickRoute.toolHint!,
            currentUserInput: input.userInput,
            worldState: input.defaultWorldState,
            now: input.now,
          })
        : await this.intent.recognize(
            input.recentMessages,
            input.userInput,
            input.defaultWorldState,
            this.capabilityRegistry.buildExposedCapabilityPrompt('chat', {
              surface: 'assistant',
            }) || undefined,
          );

      if (intentState.worldStateUpdate && Object.keys(intentState.worldStateUpdate).length > 0) {
        await this.worldState.update(input.conversationId, intentState.worldStateUpdate);
      }
      if (intentState.identityUpdate && Object.keys(intentState.identityUpdate).length > 0) {
        await this.writeIdentityUpdate(input.userId, intentState.identityUpdate);
      }

      const { merged, worldState } = await this.worldState.mergeSlots(
        input.conversationId,
        intentState,
        input.anchorCity ? { city: input.anchorCity } : null,
      );

      return { intentState, mergedIntentState: merged, worldState };
    } catch (err) {
      this.logger.warn(`Intent recognition failed in assembler: ${String(err)}`);
      const worldState = await this.worldState.get(input.conversationId);
      return { intentState: null, mergedIntentState: null, worldState };
    }
  }

  private async recallMemories(
    conversationId: string,
    userId: string,
    recentMessages: Array<{ role: string; content: string }>,
    personaDto: TurnContext['persona']['personaDto'],
    profile: TurnContext['user']['userProfile'],
    quickRoute?: QuickRouterOutput | null,
  ): Promise<TurnContext['memory']> {
    const personaPrompt = this.persona.buildPersonaPrompt(personaDto);
    const personaTokens = estimateTokens(personaPrompt);
    const coreTokens = this.flags.featureImpressionCore ? estimateTokens(profile.impressionCore || '') : 0;
    const memoryBudget = Math.max(200, this.flags.maxSystemTokens - personaTokens - coreTokens);
    const strategy = this.memoryRecaller.getStrategyName?.() ?? 'keyword';
    const isLightweightChatPath = quickRoute?.path === 'chat';
    const isFastToolPath = quickRoute?.path === 'tool';

    if (!this.flags.featureKeywordPrefilter) {
      const recalled = await this.memoryRecaller.recall({
        conversationId,
        userId,
        recentUserMessages: recentMessages
          .filter((message) => message.role === 'user')
          .map((message) => message.content),
        maxMid: this.flags.memoryMidK,
        maxLong: this.flags.memoryCandidatesMaxLong,
      });
      const injectedMemories = [
        ...recalled.midMemories,
        ...recalled.longMemories,
      ].map((memory) => ({
        id: memory.id,
        type: memory.type,
        content: memory.content,
      }));
      return {
        strategy,
        injectedMemories,
        candidatesCount: recalled.candidatesCount,
        needDetail: false,
        memoryBudgetTokens: memoryBudget,
      };
    }

    const recallCtx = {
      conversationId,
      userId,
      recentUserMessages: recentMessages
        .filter((message) => message.role === 'user')
        .map((message) => message.content),
      maxLong: this.flags.memoryCandidatesMaxLong,
      maxMid: this.flags.memoryCandidatesMaxMid,
      minRelevanceScore: this.flags.memoryMinRelevanceScore,
    };

    const candidates = this.memoryRecaller.recallCandidates
      ? await this.memoryRecaller.recallCandidates(recallCtx)
      : await this.adaptRecallCandidates(recallCtx);

    let activeCandidates: MemoryCandidate[] = candidates.filter((c) => !c.deferred);
    if (isLightweightChatPath || isFastToolPath) {
      const maxCandidates = isFastToolPath ? 3 : 4;
      const injectedMemories = this.router.selectMemoriesForInjection(
        activeCandidates.slice(0, maxCandidates),
        Math.min(memoryBudget, isFastToolPath ? 420 : 560),
        this.flags.memoryContentMaxChars,
        this.flags.featureShortSummary,
      );
      return {
        strategy,
        injectedMemories,
        candidatesCount: candidates.length,
        needDetail: false,
        memoryBudgetTokens: memoryBudget,
      };
    }

    const relatedMemories = await this.memoryService.getRelatedMemories(userId, activeCandidates.map((c) => c.id), 5);
    if (relatedMemories.length > 0) {
      const existingIds = new Set(activeCandidates.map((c) => c.id));
      activeCandidates = [...activeCandidates, ...relatedMemories.filter((m) => !existingIds.has(m.id))];
    }

    let needDetail = false;
    if (this.flags.featureLlmRank && activeCandidates.length > this.flags.minCandidatesForLlmRank) {
      const ranked = await this.router.rankMemoriesByRelevance({
        recentMessages,
        candidates: activeCandidates,
        tokenBudget: memoryBudget,
      });
      needDetail = ranked.needDetail;
      const idToCandidate = new Map(activeCandidates.map((c) => [c.id, c]));
      const reordered = ranked.rankedIds.map((id) => idToCandidate.get(id)).filter((c): c is MemoryCandidate => !!c);
      const unranked = activeCandidates.filter((c) => !ranked.rankedIds.includes(c.id));
      activeCandidates = [...reordered, ...unranked];
    }

    const budget = this.flags.featureDynamicTopK ? memoryBudget : 900;
    const injectedMemories = this.router.selectMemoriesForInjection(
      activeCandidates,
      budget,
      this.flags.memoryContentMaxChars,
      this.flags.featureShortSummary,
    );

    return {
      strategy,
      injectedMemories,
      candidatesCount: candidates.length,
      needDetail,
      memoryBudgetTokens: memoryBudget,
    };
  }

  private async adaptRecallCandidates(
    ctx: {
      conversationId: string;
      userId: string;
      recentUserMessages: string[];
      maxLong: number;
      maxMid: number;
      minRelevanceScore?: number;
    },
  ): Promise<MemoryCandidate[]> {
    void ctx.minRelevanceScore;
    const recalled = await this.memoryRecaller.recall({
      conversationId: ctx.conversationId,
      userId: ctx.userId,
      recentUserMessages: ctx.recentUserMessages,
      maxLong: ctx.maxLong,
      maxMid: ctx.maxMid,
    });

    return [...recalled.midMemories, ...recalled.longMemories].map((memory) => ({
      id: memory.id,
      type: memory.type,
      category: memory.category,
      content: memory.content,
      shortSummary: memory.shortSummary,
      confidence: memory.confidence,
      score: memory.confidence,
      deferred: false,
    }));
  }

  private async buildClaimAndSessionContext(userId: string, conversationId: string): Promise<TurnContext['claims']> {
    const claimSignals: TurnContext['claims']['claimSignals'] = [];
    let claimPolicyText = '';
    let sessionState: TurnContext['claims']['sessionState'] = null;
    let sessionStateText = '';
    const injectedClaimsDebug: TurnContext['claims']['injectedClaimsDebug'] = [];
    let draftClaimsDebug: TurnContext['claims']['draftClaimsDebug'] = [];

    if (this.claimConfig.readNewEnabled && this.claimConfig.injectionEnabled) {
      const rows = await this.claimSelector.getInjectableClaims(userId, {
        JUDGEMENT_PATTERN: 3,
        VALUE: 3,
        INTERACTION_PREFERENCE: 6,
        EMOTIONAL_TENDENCY: 3,
        RELATION_RHYTHM: 2,
      }, {
        typePriority: ['INTERACTION_PREFERENCE', 'RELATION_RHYTHM', 'EMOTIONAL_TENDENCY', 'JUDGEMENT_PATTERN', 'VALUE'],
      });

      for (const row of rows) {
        const value = typeof row.valueJson === 'string' ? row.valueJson : JSON.stringify(row.valueJson);
        injectedClaimsDebug.push({ type: row.type, key: row.key, confidence: row.confidence, status: row.status });
        claimSignals.push({ type: row.type, key: row.key, value, confidence: row.confidence });
      }

      if (claimSignals.length > 0) {
        const lines = ['[长期 Claims（stable/core）]'];
        let used = estimateTokens(lines[0]);
        for (const c of claimSignals.slice(0, 20)) {
          const line = `- [${c.type}] ${c.key}=${c.value} (conf=${c.confidence.toFixed(2)})`;
          const t = estimateTokens(line);
          if (used + t > this.claimConfig.injectionTokenBudget) break;
          lines.push(line);
          used += t;
        }
        claimPolicyText = lines.join('\n');
      }
    }

    if (this.claimConfig.readNewEnabled && this.claimConfig.sessionStateInjectionEnabled) {
      const fresh = await this.sessionStateStore.getFreshState(userId, conversationId);
      if (fresh && typeof fresh.stateJson === 'object') {
        const data = fresh.stateJson;
        sessionState = {
          ...(typeof data.mood === 'string' ? { mood: data.mood } : {}),
          ...(typeof data.energy === 'string' ? { energy: data.energy } : {}),
          ...(typeof data.focus === 'string' ? { focus: data.focus } : {}),
          ...(typeof data.taskIntent === 'string' ? { taskIntent: data.taskIntent } : {}),
          confidence: fresh.confidence,
        };
        if (Object.keys(sessionState).length > 0) {
          sessionStateText = [
            '[SessionState（TTL 内短期状态）]',
            sessionState.mood ? `- mood: ${sessionState.mood}` : '',
            sessionState.energy ? `- energy: ${sessionState.energy}` : '',
            sessionState.focus ? `- focus: ${sessionState.focus}` : '',
            sessionState.taskIntent ? `- taskIntent: ${sessionState.taskIntent}` : '',
            `- confidence: ${fresh.confidence.toFixed(2)}`,
          ].filter(Boolean).join('\n');
        }
      }
    }

    if (this.flags.featureDebugMeta && this.claimConfig.readNewEnabled) {
      const rows = await this.claimSelector.getDraftClaimsForDebug(userId, { perTypeLimit: 6, totalLimit: 60 });
      draftClaimsDebug = rows.map((r) => ({ type: r.type, key: r.key, confidence: r.confidence, status: r.status }));
    }

    return { claimSignals, claimPolicyText, sessionState, sessionStateText, injectedClaimsDebug, draftClaimsDebug };
  }

  private async buildRelationshipContext(input: {
    conversationId: string;
    userId: string;
    userInput: string;
    recentMessages: Array<{ role: string; content: string }>;
  }): Promise<TurnContext['relationship']> {
    const contextText = [
      ...input.recentMessages.slice(-4).map((message) => message.content),
      input.userInput,
    ]
      .filter(Boolean)
      .join('\n');

    const [relevantSharedExperiences, recentReflections] = await Promise.all([
      this.sharedExperience.findRelevant(input.userId, contextText, 2),
      this.sessionReflection.list({
        conversationId: input.conversationId,
        limit: 3,
      }),
    ]);

    return {
      sharedExperiences: relevantSharedExperiences.filter((item) => item.significance > 0.6).slice(0, 2),
      rhythmObservations: recentReflections
        .map((reflection) => reflection.rhythmNote?.trim() ?? '')
        .filter((note) => note.length > 0)
        .slice(0, 3),
    };
  }

  private async buildSocialContext(input: {
    userId: string;
    userInput: string;
    recentMessages: Array<{ role: string; content: string }>;
  }): Promise<TurnContext['social']> {
    const contextText = [
      ...input.recentMessages.slice(-4).map((message) => message.content),
      input.userInput,
    ]
      .filter(Boolean)
      .join('\n');

    const [entities, insights] = await Promise.all([
      this.socialEntity.findRelevant(input.userId, contextText, 3),
      this.socialInsight.findRelevant(input.userId, contextText, 2),
    ]);
    const relationSignals = await this.socialRelationEdge.findRelevant(
      input.userId,
      contextText,
      2,
      [
        ...insights.flatMap((item) => item.relatedEntityIds),
        ...entities.map((item) => item.id),
      ],
    );
    return {
      entities: entities.filter((item) => Boolean(item.description?.trim())).slice(0, 3),
      insights: insights.filter((item) => item.confidence >= 0.58).slice(0, 2),
      relationSignals: relationSignals
        .filter((item) => item.trend === 'declining' || item.quality <= 0.5)
        .slice(0, 2),
    };
  }

  private async writeIdentityUpdate(
    userId: string,
    update: import('../intent/intent.types').IdentityUpdateFromIntent,
  ): Promise<void> {
    const entries = Object.entries(update).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0);
    if (entries.length === 0) return;

    const anchors = await this.identityAnchor.getActiveAnchors(userId);
    for (const [key, value] of entries) {
      const label = TurnContextAssembler.IDENTITY_LABEL_MAP[key];
      if (!label) continue;
      const existing = anchors.find((a) => a.label === label);
      if (existing && existing.content !== value) {
        await this.identityAnchor.update(existing.id, { content: value });
      } else if (!existing && anchors.length < 5) {
        await this.identityAnchor.create({ label, content: value }, userId);
      }
    }
  }
}
