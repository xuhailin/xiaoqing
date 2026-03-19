import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { PersonaService } from '../persona/persona.service';
import { UserProfileService } from '../persona/user-profile.service';
import { IdentityAnchorService } from '../identity-anchor/identity-anchor.service';
import { WorldStateService } from '../../infra/world-state/world-state.service';
import { CognitiveGrowthService } from '../cognitive-pipeline/cognitive-growth.service';
import { MemoryService, type MemoryCandidate } from '../memory/memory.service';
import { PromptRouterService } from '../prompt-router/prompt-router.service';
import { ActionReasonerService } from '../action-reasoner/action-reasoner.service';
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
    private readonly userProfile: UserProfileService,
    private readonly identityAnchor: IdentityAnchorService,
    private readonly worldState: WorldStateService,
    private readonly cognitiveGrowth: CognitiveGrowthService,
    private readonly memory: MemoryService,
    private readonly router: PromptRouterService,
    private readonly intent: IntentService,
    private readonly actionReasoner: ActionReasonerService,
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
    userInput: string;
    userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    now: Date;
    recentRounds: number;
  }): Promise<TurnContext> {
    const [recentRaw, personaDto, profile, anchors, storedWorldState, growthContext, systemSelf] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(0, input.recentRounds) * 2,
      }),
      this.persona.getOrCreate(),
      this.userProfile.getOrCreate(),
      this.identityAnchor.getActiveAnchors(),
      this.worldState.get(input.conversationId),
      this.cognitiveGrowth.getGrowthContext(),
      this.systemSelf.getSystemSelf('chat'),
    ]);

    const recentMessages = recentRaw.reverse().map((m) => ({ role: m.role, content: m.content }));
    const anchorText = this.identityAnchor.buildAnchorText(anchors);
    const anchorCity = anchors.find((a) => a.label === 'location')?.content?.trim() || undefined;
    const defaultWorldState = anchorCity && !storedWorldState?.city
      ? { ...(storedWorldState ?? {}), city: anchorCity }
      : storedWorldState;

    const memoryCtx = await this.recallMemories(recentMessages, personaDto, profile);
    const intentCtx = await this.resolveIntent({
      conversationId: input.conversationId,
      userInput: input.userInput,
      recentMessages,
      defaultWorldState,
      anchorCity,
    });
    const fullWorldState = await this.worldState.get(input.conversationId);
    const claimCtx = await this.buildClaimAndSessionContext(input.conversationId);
    const relationshipCtx = await this.buildRelationshipContext({
      conversationId: input.conversationId,
      userInput: input.userInput,
      recentMessages,
    });
    const socialCtx = await this.buildSocialContext({
      userInput: input.userInput,
      recentMessages,
    });

    // 读取上一轮的反思结果
    let previousReflection: { quality: 'good' | 'suboptimal' | 'failed'; adjustmentHint: string; timestamp: Date } | undefined;
    try {
      const userKey = 'default-user'; // 当前系统使用固定 userKey
      const sessionState = await this.sessionStateStore.getFreshState(userKey, input.conversationId);
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

    const resolvedIntent = intentCtx.mergedIntentState ?? intentCtx.intentState;
    const actionDecision = this.actionReasoner.decide(resolvedIntent ?? null, input.userInput);

    return {
      request: {
        conversationId: input.conversationId,
        now: input.now,
        userInput: input.userInput,
        userMessage: input.userMessage,
      },
      conversation: { recentMessages },
      persona: {
        personaDto,
        expressionFields: this.persona.getExpressionFields(personaDto),
        metaFilterPolicy: personaDto.metaFilterPolicy ?? null,
      },
      user: {
        userProfile: profile,
        identityAnchors: anchors,
        anchorText,
        ...(anchorCity ? { anchorCity } : {}),
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
        actionDecision,
        memoryRecall: {
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
    userInput: string;
    userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    now: Date;
    recentRounds: number;
  }): Promise<TurnContext> {
    const [recentRaw, personaDto, profile, anchors, storedWorldState, growthContext, systemSelf] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(0, input.recentRounds) * 2,
      }),
      this.persona.getOrCreate(),
      this.userProfile.getOrCreate(),
      this.identityAnchor.getActiveAnchors(),
      this.worldState.get(input.conversationId),
      this.cognitiveGrowth.getGrowthContext(),
      this.systemSelf.getSystemSelf('chat'),
    ]);

    const recentMessages = recentRaw.reverse().map((m) => ({ role: m.role, content: m.content }));
    const anchorText = this.identityAnchor.buildAnchorText(anchors);
    const anchorCity = anchors.find((a) => a.label === 'location')?.content?.trim() || undefined;
    const defaultWorldState = anchorCity && !storedWorldState?.city
      ? { ...(storedWorldState ?? {}), city: anchorCity }
      : storedWorldState;

    return {
      request: { ...input },
      conversation: { recentMessages },
      persona: {
        personaDto,
        expressionFields: this.persona.getExpressionFields(personaDto),
        metaFilterPolicy: personaDto.metaFilterPolicy ?? null,
      },
      user: { userProfile: profile, identityAnchors: anchors, anchorText, ...(anchorCity ? { anchorCity } : {}) },
      world: { storedWorldState, defaultWorldState, fullWorldState: storedWorldState },
      memory: { injectedMemories: [], candidatesCount: 0, needDetail: false, memoryBudgetTokens: 0 },
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
      runtime: {},
    };
  }

  private async resolveIntent(input: {
    conversationId: string;
    userInput: string;
    recentMessages: Array<{ role: string; content: string }>;
    defaultWorldState: TurnContext['world']['defaultWorldState'];
    anchorCity?: string;
  }): Promise<{ intentState: DialogueIntentState | null; mergedIntentState: DialogueIntentState | null }> {
    const hasAnyChatCapability =
      this.flags.featureOpenClaw ||
      this.capabilityRegistry.listExposed('chat', { surface: 'assistant' }).length > 0;
    if (!hasAnyChatCapability) return { intentState: null, mergedIntentState: null };

    try {
      const capabilityPrompt = this.capabilityRegistry.buildExposedCapabilityPrompt('chat', {
        surface: 'assistant',
      });
      const intentState = await this.intent.recognize(
        input.recentMessages,
        input.userInput,
        input.defaultWorldState,
        capabilityPrompt || undefined,
      );

      if (intentState.worldStateUpdate && Object.keys(intentState.worldStateUpdate).length > 0) {
        await this.worldState.update(input.conversationId, intentState.worldStateUpdate);
      }
      if (intentState.identityUpdate && Object.keys(intentState.identityUpdate).length > 0) {
        await this.writeIdentityUpdate(intentState.identityUpdate);
      }

      const { merged } = await this.worldState.mergeSlots(
        input.conversationId,
        intentState,
        input.anchorCity ? { city: input.anchorCity } : null,
      );

      return { intentState, mergedIntentState: merged };
    } catch (err) {
      this.logger.warn(`Intent recognition failed in assembler: ${String(err)}`);
      return { intentState: null, mergedIntentState: null };
    }
  }

  private async recallMemories(
    recentMessages: Array<{ role: string; content: string }>,
    personaDto: TurnContext['persona']['personaDto'],
    profile: TurnContext['user']['userProfile'],
  ): Promise<TurnContext['memory']> {
    const personaPrompt = this.persona.buildPersonaPrompt(personaDto);
    const personaTokens = estimateTokens(personaPrompt);
    const coreTokens = this.flags.featureImpressionCore ? estimateTokens(profile.impressionCore || '') : 0;
    const memoryBudget = Math.max(200, this.flags.maxSystemTokens - personaTokens - coreTokens);

    if (!this.flags.featureKeywordPrefilter) {
      const injectedMemories = await this.memory.getForInjection(this.flags.memoryMidK);
      return { injectedMemories, candidatesCount: injectedMemories.length, needDetail: false, memoryBudgetTokens: memoryBudget };
    }

    const candidates = await this.memory.getCandidatesForRecall({
      recentMessages,
      maxLong: this.flags.memoryCandidatesMaxLong,
      maxMid: this.flags.memoryCandidatesMaxMid,
      minRelevanceScore: this.flags.memoryMinRelevanceScore,
    });

    let activeCandidates: MemoryCandidate[] = candidates.filter((c) => !c.deferred);
    const relatedMemories = await this.memory.getRelatedMemories(activeCandidates.map((c) => c.id), 5);
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
      injectedMemories,
      candidatesCount: candidates.length,
      needDetail,
      memoryBudgetTokens: memoryBudget,
    };
  }

  private async buildClaimAndSessionContext(conversationId: string): Promise<TurnContext['claims']> {
    const claimSignals: TurnContext['claims']['claimSignals'] = [];
    let claimPolicyText = '';
    let sessionState: TurnContext['claims']['sessionState'] = null;
    let sessionStateText = '';
    const injectedClaimsDebug: TurnContext['claims']['injectedClaimsDebug'] = [];
    let draftClaimsDebug: TurnContext['claims']['draftClaimsDebug'] = [];

    if (this.claimConfig.readNewEnabled && this.claimConfig.injectionEnabled) {
      const rows = await this.claimSelector.getInjectableClaims('default-user', {
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
      const fresh = await this.sessionStateStore.getFreshState('default-user', conversationId);
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
      const rows = await this.claimSelector.getDraftClaimsForDebug('default-user', { perTypeLimit: 6, totalLimit: 60 });
      draftClaimsDebug = rows.map((r) => ({ type: r.type, key: r.key, confidence: r.confidence, status: r.status }));
    }

    return { claimSignals, claimPolicyText, sessionState, sessionStateText, injectedClaimsDebug, draftClaimsDebug };
  }

  private async buildRelationshipContext(input: {
    conversationId: string;
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
      this.sharedExperience.findRelevant(contextText, 2),
      this.sessionReflection.list({ limit: 3 }),
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
      this.socialEntity.findRelevant(contextText, 3),
      this.socialInsight.findRelevant(contextText, 2),
    ]);
    const relationSignals = await this.socialRelationEdge.findRelevant(
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

  private async writeIdentityUpdate(update: import('../intent/intent.types').IdentityUpdateFromIntent): Promise<void> {
    const entries = Object.entries(update).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0);
    if (entries.length === 0) return;

    const anchors = await this.identityAnchor.getActiveAnchors();
    for (const [key, value] of entries) {
      const label = TurnContextAssembler.IDENTITY_LABEL_MAP[key];
      if (!label) continue;
      const existing = anchors.find((a) => a.label === label);
      if (existing && existing.content !== value) {
        await this.identityAnchor.update(existing.id, { content: value });
      } else if (!existing && anchors.length < 5) {
        await this.identityAnchor.create({ label, content: value });
      }
    }
  }
}
