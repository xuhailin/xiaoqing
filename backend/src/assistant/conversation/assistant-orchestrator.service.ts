import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { estimateTokens } from '../../infra/token-estimator';
import { ActionReasonerService } from '../action-reasoner/action-reasoner.service';
import { ReflectionService } from '../reflection/reflection.service';
import { PostTurnPipeline } from '../post-turn/post-turn.pipeline';
import { TurnContextAssembler } from './turn-context-assembler.service';
import { ChatCompletionRunner } from './chat-completion-runner.service';
import { SummarizeTriggerService } from './summarize-trigger.service';
import { SessionStateService } from '../claim-engine/session-state.service';
import type { SendMessageResult, ToolPolicyDecision, TurnContext } from './orchestration.types';

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
    private readonly prisma: PrismaService,
  ) {}

  async processTurn(input: {
    conversationId: string;
    userInput: string;
    userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    recentRounds: number;
  }): Promise<SendMessageResult> {
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
    try {
      result = await this.completionRunner.execute(context, policy);
    } catch (err) {
      this.logger.error(`chat completion failed: ${String(err)}`);
      const fallback = '抱歉，我刚刚处理失败了。请再说一次，我会继续。';
      const assistantMsg = await this.prisma.message.create({
        data: {
          conversationId: input.conversationId,
          role: 'assistant',
          content: fallback,
          tokenCount: estimateTokens(fallback),
        },
      });
      result = {
        userMessage: input.userMessage,
        assistantMessage: {
          id: assistantMsg.id,
          role: assistantMsg.role,
          content: assistantMsg.content,
          createdAt: assistantMsg.createdAt,
        },
        injectedMemories: context.memory.injectedMemories,
      };
    }

    // Reflection: 评估本轮决策质量
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

    try {
      await this.postTurnPipeline.runAfterReturn(
        {
          conversationId: input.conversationId,
          turn: {
            turnId: input.userMessage.id,
            userMessageId: input.userMessage.id,
            assistantMessageId: result.assistantMessage.id,
            userInput: input.userInput,
            assistantOutput: result.assistantMessage.content,
            now: new Date(),
          },
          context: {
            intentState: context.runtime.mergedIntentState ?? context.runtime.intentState ?? null,
            cognitiveState: context.runtime.cognitiveState,
          },
          beforeReturn: [],
          afterReturn: [],
        },
        async () => undefined,
      );
    } catch (err) {
      this.logger.warn(`postTurn step failed: ${String(err)}`);
    }

    try {
      await this.summarizeTrigger.maybeAutoSummarize(input.conversationId, input.userInput);
    } catch (err) {
      this.logger.warn(`summarize trigger step failed: ${String(err)}`);
    }

    return result;
  }
}
