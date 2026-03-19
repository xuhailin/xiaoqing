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
    private readonly dailyMoment: DailyMomentService,
    private readonly cognitiveGrowth: CognitiveGrowthService,
    private readonly observationEmitter: ObservationEmitterService,
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
}
