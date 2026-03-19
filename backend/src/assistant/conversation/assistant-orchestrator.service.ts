import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { estimateTokens } from '../../infra/token-estimator';
import { ActionReasonerService } from '../action-reasoner/action-reasoner.service';
import { ReflectionService } from '../reflection/reflection.service';
import { PostTurnPipeline } from '../post-turn/post-turn.pipeline';
import type { PostTurnPlan, PostTurnTask } from '../post-turn/post-turn.types';
import { TurnContextAssembler } from './turn-context-assembler.service';
import { ChatCompletionRunner } from './chat-completion-runner.service';
import { SummarizeTriggerService } from './summarize-trigger.service';
import { SessionStateService } from '../claim-engine/session-state.service';
import { DailyMomentService } from '../life-record/daily-moment/daily-moment.service';
import { CognitiveGrowthService } from '../cognitive-pipeline/cognitive-growth.service';
import { ObservationEmitterService } from '../cognitive-trace/observation/observation-emitter.service';
import type { TurnCognitiveResult } from '../cognitive-trace/cognitive-trace.types';
import { RelationshipOverviewService } from '../relationship-overview/relationship-overview.service';
import { SessionReflectionService } from '../session-reflection/session-reflection.service';
import type { ReflectionResult } from '../session-reflection/session-reflection.types';
import { ClaimUpdateService } from '../claim-engine/claim-update.service';
import { ClaimEngineConfig } from '../claim-engine/claim-engine.config';
import { ClaimSchemaRegistry } from '../claim-engine/claim-schema.registry';
import { TracePointExtractorService } from '../life-record/trace-point/trace-point-extractor.service';
import { SocialEntityClassifierService } from '../life-record/social-entity/social-entity-classifier.service';
import { SocialEntityService } from '../life-record/social-entity/social-entity.service';
import { SocialRelationEdgeService } from '../life-record/social-relation-edge/social-relation-edge.service';
import type { SendMessageResult, ToolPolicyDecision, TurnContext } from './orchestration.types';
import { toConversationMessageDto } from './message.dto';

@Injectable()
export class AssistantOrchestrator {
  private readonly logger = new Logger(AssistantOrchestrator.name);

  constructor(
    private readonly assembler: TurnContextAssembler,
    private readonly actionReasoner: ActionReasonerService,
    private readonly reflectionService: ReflectionService,
    private readonly completionRunner: ChatCompletionRunner,
    private readonly postTurnPipeline: PostTurnPipeline,
    private readonly summarizeTrigger: SummarizeTriggerService,
    private readonly sessionState: SessionStateService,
    private readonly claimUpdate: ClaimUpdateService,
    private readonly claimConfig: ClaimEngineConfig,
    private readonly tracePointExtractor: TracePointExtractorService,
    private readonly socialEntityClassifier: SocialEntityClassifierService,
    private readonly socialEntity: SocialEntityService,
    private readonly socialRelationEdge: SocialRelationEdgeService,
    private readonly dailyMoment: DailyMomentService,
    private readonly cognitiveGrowth: CognitiveGrowthService,
    private readonly observationEmitter: ObservationEmitterService,
    private readonly relationshipOverview: RelationshipOverviewService,
    private readonly sessionReflection: SessionReflectionService,
    private readonly prisma: PrismaService,
  ) {}

  async processTurn(input: {
    conversationId: string;
    userInput: string;
    userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    recentRounds: number;
    runtimePolicy?: {
      allowPostTurn?: boolean;
      allowReflection?: boolean;
    };
  }): Promise<SendMessageResult> {
    const allowPostTurn = input.runtimePolicy?.allowPostTurn !== false;
    const allowReflection = input.runtimePolicy?.allowReflection !== false;
    let context: TurnContext;
    try {
      context = await this.assembler.assemble({
        conversationId: input.conversationId,
        userInput: input.userInput,
        userMessage: input.userMessage,
        now: new Date(),
        recentRounds: input.recentRounds,
      });
    } catch (err) {
      this.logger.warn(`assemble failed, fallback assembleFallback: ${String(err)}`);
      context = await this.assembler.assembleFallback({
        conversationId: input.conversationId,
        userInput: input.userInput,
        userMessage: input.userMessage,
        now: new Date(),
        recentRounds: Math.min(2, input.recentRounds),
      });
    }

    let policy: ToolPolicyDecision = { action: 'chat', reason: 'intent 未命中，默认聊天路径' };
    try {
      if (context.runtime.actionDecision) {
        policy = this.actionReasoner.toToolPolicy(context.runtime.actionDecision);
      } else {
        const resolvedIntent = context.runtime.mergedIntentState ?? context.runtime.intentState;
        if (resolvedIntent) {
          const decision = this.actionReasoner.decide(resolvedIntent);
          policy = this.actionReasoner.toToolPolicy(decision);
        }
      }
    } catch (err) {
      this.logger.warn(`resolve policy failed, fallback chat: ${String(err)}`);
    }

    let result: SendMessageResult;
    let postTurnPlan: PostTurnPlan | undefined;
    try {
      const completion = await this.completionRunner.execute(context, policy);
      result = completion.result;
      postTurnPlan = completion.postTurnPlan;
    } catch (err) {
      this.logger.error(`chat completion failed: ${String(err)}`);
      const fallback = '抱歉，我刚刚处理失败了。请再说一次，我会继续。';
      const assistantMsg = await this.prisma.message.create({
        data: {
          conversationId: input.conversationId,
          role: 'assistant',
          kind: 'system',
          content: fallback,
          metadata: {
            source: 'system',
            summary: 'assistant fallback reply',
          },
          tokenCount: estimateTokens(fallback),
        },
      });
      result = {
        userMessage: toConversationMessageDto(input.userMessage),
        assistantMessage: toConversationMessageDto(assistantMsg),
        injectedMemories: context.memory.injectedMemories,
      };
    }

    if (postTurnPlan && allowPostTurn) {
      try {
        result = await this.runBeforeReturnPostTurn(postTurnPlan, result);
      } catch (err) {
        this.logger.warn(`postTurn beforeReturn failed: ${String(err)}`);
      }
    }

    // Reflection: 评估本轮决策质量
    if (allowReflection) {
      try {
        const resolvedIntent = context.runtime.mergedIntentState ?? context.runtime.intentState;
        const reflection = this.reflectionService.reflect({
          userInput: input.userInput,
          intentState: resolvedIntent ? {
            taskIntent: resolvedIntent.taskIntent,
            confidence: resolvedIntent.confidence,
            requiresTool: resolvedIntent.requiresTool,
          } : undefined,
          actionDecision: context.runtime.actionDecision ? {
            action: context.runtime.actionDecision.action,
            reason: context.runtime.actionDecision.reason,
            confidence: context.runtime.actionDecision.confidence,
          } : undefined,
          toolPolicy: { action: policy.action, capability: policy.capability },
          assistantOutput: result.assistantMessage.content,
          hasError: false,
        });

        if (reflection.quality !== 'good') {
          this.logger.warn(`Reflection: ${reflection.quality} - ${reflection.issues?.join('; ')}`);
        }

        // 持久化反思结果到 SessionState（如果有 adjustmentHint）
        if (reflection.adjustmentHint) {
          try {
            const userKey = 'default-user'; // 当前系统使用固定 userKey
            await this.sessionState.upsertState({
              userKey,
              sessionId: input.conversationId,
              state: {
                lastReflection: {
                  quality: reflection.quality,
                  adjustmentHint: reflection.adjustmentHint,
                  timestamp: new Date(),
                },
              },
              confidence: 0.8,
              ttlSeconds: 21600, // 6 小时
              sourceModel: 'reflection-service',
            });
          } catch (err) {
            this.logger.warn(`Failed to persist reflection: ${String(err)}`);
          }
        }
      } catch (err) {
        this.logger.warn(`reflection failed: ${String(err)}`);
      }
    }

    if (postTurnPlan && allowPostTurn) {
      this.postTurnPipeline.runAfterReturn(
        postTurnPlan,
        async (task, plan) => this.runAfterReturnTask(task, plan),
      ).catch((err) => this.logger.warn(`postTurn afterReturn failed: ${String(err)}`));
    }

    return result;
  }

  private async runBeforeReturnPostTurn(
    plan: PostTurnPlan,
    initialResult: SendMessageResult,
  ): Promise<SendMessageResult> {
    let result = initialResult;
    await this.postTurnPipeline.runBeforeReturn(plan, async (task, currentPlan) => {
      if (task.type !== 'daily_moment_suggestion') return;

      const suggestion = await this.runDailyMomentSuggestion(currentPlan);
      if (!suggestion) return;

      const mergedContent = `${result.assistantMessage.content}\n\n${suggestion.hint}`;
      const assistantMsg = await this.prisma.message.update({
        where: { id: result.assistantMessage.id },
        data: {
          content: mergedContent,
          tokenCount: estimateTokens(mergedContent),
        },
      });

      currentPlan.turn.assistantOutput = assistantMsg.content;
      result = {
        ...result,
        assistantMessage: toConversationMessageDto(assistantMsg),
        dailyMoment: {
          mode: 'suggestion',
          suggestion,
        },
      };
    });
    return result;
  }

  private async runAfterReturnTask(
    task: PostTurnTask,
    plan: PostTurnPlan,
  ): Promise<void> {
    if (task.type === 'life_record_sync') {
      await this.runLifeRecordSync(plan);
      return;
    }

    if (task.type === 'record_growth') {
      if (!plan.context.cognitiveState) return;
      await this.cognitiveGrowth.recordTurnGrowth(plan.context.cognitiveState, [
        plan.turn.userMessageId,
        plan.turn.assistantMessageId,
      ]);

      // 填充 growthOps 到 collector，供后续 record_cognitive_observation 使用
      const cs = plan.context.cognitiveState;
      if (cs.userModelDelta.shouldWriteCognitive) {
        plan.opsCollector.growthOps.push({ type: 'profile_pending', detail: cs.userModelDelta.rationale.join('; ') });
      }
      if (cs.userModelDelta.shouldWriteRelationship) {
        plan.opsCollector.growthOps.push({ type: 'stage_check', detail: `relationship stage: ${cs.relationship.stage}` });
      }
      if (cs.safety.notes.length > 0) {
        plan.opsCollector.growthOps.push({ type: 'boundary', detail: cs.safety.notes.join('; ') });
      }
      return;
    }

    if (task.type === 'summarize_trigger') {
      if (task.trigger === 'flush') {
        await this.summarizeTrigger.flushSummarize(plan.conversationId);
        return;
      }
      const ops = await this.summarizeTrigger.maybeAutoSummarize(
        plan.conversationId,
        plan.turn.userInput,
      );
      // 填充 memoryOps / claimOps 到 collector
      plan.opsCollector.memoryOps.push(...ops.memoryOps);
      plan.opsCollector.claimOps.push(...ops.claimOps);
      return;
    }

    if (task.type === 'record_cognitive_observation') {
      if (!plan.context.cognitiveState) return;
      const cs = plan.context.cognitiveState;

      const strategyShifted =
        cs.situation.kind !== 'casual_chat' ||
        cs.responseStrategy.primaryMode !== 'companion';

      const turnCogResult: TurnCognitiveResult = {
        conversationId: plan.conversationId,
        messageId: plan.turn.assistantMessageId,
        happenedAt: plan.turn.now,
        cognitiveState: cs,
        memoryOps: plan.opsCollector.memoryOps,
        claimOps: plan.opsCollector.claimOps,
        growthOps: plan.opsCollector.growthOps,
        strategyShifted,
      };
      await this.observationEmitter.emit(turnCogResult);
      return;
    }

    if (task.type === 'session_reflection') {
      await this.runSessionReflection(plan);
    }
  }

  private async runDailyMomentSuggestion(
    plan: PostTurnPlan,
  ): Promise<NonNullable<SendMessageResult['dailyMoment']>['suggestion'] | null> {
    const suggestionCheck = await this.dailyMoment.maybeSuggest({
      conversationId: plan.conversationId,
      now: plan.turn.now,
    });

    return suggestionCheck.shouldSuggest ? suggestionCheck.suggestion ?? null : null;
  }

  private async runSessionReflection(plan: PostTurnPlan): Promise<void> {
    const recentMessages = await this.prisma.message.findMany({
      where: { conversationId: plan.conversationId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { role: true, content: true },
    });

    if (!this.shouldRunSessionReflection(plan, recentMessages)) {
      return;
    }

    let relationshipContext:
      | {
          stage: string;
          trustScore: number;
          closenessScore: number;
        }
      | undefined;

    try {
      const overview = await this.relationshipOverview.getOverview();
      relationshipContext = {
        stage: overview.stage,
        trustScore: overview.trustScore,
        closenessScore: overview.closenessScore,
      };
    } catch (err) {
      this.logger.warn(`Failed to load relationship overview for session reflection: ${String(err)}`);
    }

    const reflection = await this.sessionReflection.reflect({
      conversationId: plan.conversationId,
      recentMessages: recentMessages
        .reverse()
        .map((message) => ({ role: message.role, content: message.content })),
      relationshipContext,
    });

    if (reflection?.newRhythmSignal) {
      await this.writeRhythmSignalClaim(plan, reflection.newRhythmSignal);
    }

    if (reflection?.socialRelationSignals?.length) {
      await this.writeSessionReflectionRelationEvents(plan, reflection.socialRelationSignals);
    }

    if (reflection && (reflection.trustDelta !== 0 || reflection.closenessDelta !== 0)) {
      await this.applySessionReflectionRelationshipDelta(plan, reflection);
    }
  }

  private shouldRunSessionReflection(
    plan: PostTurnPlan,
    recentMessages: Array<{ role: string; content: string }>,
  ): boolean {
    const userMessageCount = recentMessages.filter((message) => message.role === 'user').length;
    if (userMessageCount >= 4) {
      return true;
    }

    const cognitiveState = plan.context.cognitiveState;
    if (!cognitiveState) {
      return false;
    }

    if (cognitiveState.userState.fragility !== 'low') {
      return true;
    }

    return (
      cognitiveState.situation.kind === 'emotional_expression'
      || cognitiveState.situation.kind === 'co_thinking'
    );
  }

  private async writeRhythmSignalClaim(
    plan: PostTurnPlan,
    signal: NonNullable<ReflectionResult['newRhythmSignal']>,
  ): Promise<void> {
    if (!this.claimConfig.writeDualEnabled) {
      return;
    }

    const validation = ClaimSchemaRegistry.validateAny(signal.claimKey, {
      level: signal.level,
    });
    if (!validation.ok) {
      this.logger.warn(`Skip rhythm signal claim: invalid key ${signal.claimKey} (${validation.reason})`);
      return;
    }
    if (validation.kind === 'draft' && !this.claimConfig.draftEnabled) {
      return;
    }
    if (!validation.key.startsWith('rr.') && !validation.key.startsWith('draft.rr.')) {
      this.logger.warn(`Skip rhythm signal claim: unexpected key prefix ${validation.key}`);
      return;
    }

    try {
      await this.claimUpdate.upsertFromDraft({
        userKey: 'default-user',
        type: 'RELATION_RHYTHM',
        key: validation.key,
        value: validation.valueJson,
        confidence: signal.level === 'high' ? 0.72 : signal.level === 'mid' ? 0.62 : 0.55,
        sourceModel: 'session-reflection',
        contextTags: ['session_reflection', 'relationship_rhythm'],
        evidence: {
          messageId: plan.turn.userMessageId,
          sessionId: plan.conversationId,
          snippet: signal.evidence,
          polarity: 'SUPPORT',
          weight: signal.level === 'high' ? 0.8 : 0.65,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write rhythm signal claim: ${String(err)}`);
    }
  }

  private async writeSessionReflectionRelationEvents(
    plan: PostTurnPlan,
    signals: NonNullable<ReflectionResult['socialRelationSignals']>,
  ): Promise<void> {
    const createdTracePointIds: string[] = [];

    for (const signal of signals) {
      try {
        const existing = await this.prisma.tracePoint.findFirst({
          where: {
            conversationId: plan.conversationId,
            sourceMessageId: plan.turn.userMessageId,
            kind: 'relation_event',
            people: { has: signal.entityName },
            tags: { has: 'session_reflection' },
          },
          select: { id: true },
        });
        if (existing) {
          continue;
        }

        const row = await this.prisma.tracePoint.create({
          data: {
            conversationId: plan.conversationId,
            sourceMessageId: plan.turn.userMessageId,
            kind: 'relation_event',
            content: this.buildSessionRelationEventContent(signal),
            happenedAt: plan.turn.now,
            people: [signal.entityName],
            tags: ['session_reflection', 'relation_bridge', `impact:${signal.impact}`],
            extractedBy: 'realtime',
            confidence: signal.impact === 'strained' ? 0.82 : signal.impact === 'repaired' ? 0.78 : 0.74,
          },
          select: { id: true },
        });
        createdTracePointIds.push(row.id);
      } catch (err) {
        this.logger.warn(`Failed to persist session reflection relation event: ${String(err)}`);
      }
    }

    if (createdTracePointIds.length === 0) {
      return;
    }

    try {
      await Promise.all([
        this.socialEntity.syncFromTracePointIds(createdTracePointIds),
        this.socialRelationEdge.syncFromTracePointIds(createdTracePointIds),
      ]);
    } catch (err) {
      this.logger.warn(`Failed to sync relation events from session reflection: ${String(err)}`);
    }
  }

  private buildSessionRelationEventContent(
    signal: NonNullable<ReflectionResult['socialRelationSignals']>[number],
  ): string {
    const evidence = signal.evidence.trim();
    switch (signal.impact) {
      case 'strained':
        return `和${signal.entityName}有些疏远或矛盾：${evidence}`;
      case 'repaired':
        return `和${signal.entityName}的关系有所缓和，像是在慢慢和好：${evidence}`;
      case 'deepened':
      default:
        return `和${signal.entityName}更靠近了一些，关系在变得亲近：${evidence}`;
    }
  }

  private async applySessionReflectionRelationshipDelta(
    plan: PostTurnPlan,
    reflection: Pick<ReflectionResult, 'trustDelta' | 'closenessDelta'>,
  ): Promise<void> {
    try {
      const current = await this.prisma.relationshipState.findFirst({
        where: {
          isActive: true,
          status: 'confirmed',
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (!current) {
        return;
      }

      const nextTrust = this.clampRelationshipScore(current.trustScore + reflection.trustDelta);
      const nextCloseness = this.clampRelationshipScore(current.closenessScore + reflection.closenessDelta);
      const sourceMessageIds = [...new Set([...current.sourceMessageIds, plan.turn.userMessageId])];

      await this.prisma.relationshipState.update({
        where: { id: current.id },
        data: {
          trustScore: nextTrust,
          closenessScore: nextCloseness,
          sourceMessageIds,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to apply session reflection relationship delta: ${String(err)}`);
    }
  }

  private clampRelationshipScore(value: number): number {
    return Math.max(0.1, Math.min(0.95, Number(value.toFixed(2))));
  }

  private async runLifeRecordSync(plan: PostTurnPlan): Promise<void> {
    try {
      const points = await this.tracePointExtractor.extractForMessage(
        plan.conversationId,
        plan.turn.userMessageId,
      );
      if (points.length === 0) {
        return;
      }

      const tracePointIds = points.map((point) => point.id);
      const [entitySync] = await Promise.all([
        this.socialEntity.syncFromTracePointIds(tracePointIds),
        this.socialRelationEdge.syncFromTracePointIds(tracePointIds),
      ]);

      if (entitySync.entityIds.length > 0) {
        await this.socialEntityClassifier.classifyPending({
          entityIds: entitySync.entityIds,
          limit: Math.min(entitySync.entityIds.length, 4),
        });
      }
    } catch (err) {
      this.logger.warn(`life record sync failed: ${String(err)}`);
    }
  }
}
