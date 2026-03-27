import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PlanDispatchType, ReminderScope } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import { estimateTokens } from '../../infra/token-estimator';
import { FeatureFlagConfig } from './feature-flag.config';
import { ReflectionService } from '../reflection/reflection.service';
import { PostTurnPipeline } from '../post-turn/post-turn.pipeline';
import type { PostTurnPlan, PostTurnTask } from '../post-turn/post-turn.types';
import { PostTurnPlanBuilder } from '../post-turn/post-turn-plan.builder';
import { TurnContextAssembler } from './turn-context-assembler.service';
import { ChatCompletionRunner } from './chat-completion-runner.service';
import { SummarizeTriggerService } from './summarize-trigger.service';
import { SessionStateService } from '../claim-engine/session-state.service';
import { CognitiveGrowthService } from '../cognitive-pipeline/cognitive-growth.service';
import { ObservationEmitterService } from '../cognitive-trace/observation/observation-emitter.service';
import type { TurnCognitiveResult } from '../cognitive-trace/cognitive-trace.types';
import { RelationshipOverviewService } from '../relationship-overview/relationship-overview.service';
import { SessionReflectionService } from '../session-reflection/session-reflection.service';
import type { ReflectionResult } from '../session-reflection/session-reflection.types';
import { recordEmotionSnapshot } from '../post-turn/tasks/record-emotion-snapshot.task';
import { InteractionTuningLearner } from '../post-turn/tasks/interaction-tuning-learner.service';
import { ClaimUpdateService } from '../claim-engine/claim-update.service';
import { ClaimEngineConfig } from '../claim-engine/claim-engine.config';
import { ClaimSchemaRegistry } from '../claim-engine/claim-schema.registry';
import { TracePointExtractorService } from '../life-record/trace-point/trace-point-extractor.service';
import { SocialEntityClassifierService } from '../life-record/social-entity/social-entity-classifier.service';
import { SocialEntityService } from '../life-record/social-entity/social-entity.service';
import { SocialRelationEdgeService } from '../life-record/social-relation-edge/social-relation-edge.service';
import type {
  CollaborationTurnContext,
  ConversationMessageKind,
  ExecutionResult,
  SendMessageResult,
  ToolPolicyDecision,
  TurnContext,
} from './orchestration.types';
import { toConversationMessageDto } from './message.dto';
import { PlanService } from '../../plan/plan.service';
import { IdeaService } from '../../idea/idea.service';
import { TodoService } from '../../todo/todo.service';
import type { TaskIntentItem } from '../intent/intent.types';
import { ActionReasonerService } from '../action-reasoner/action-reasoner.service';
import type { ActionDecision } from '../action-reasoner/action-reasoner.types';
import type { TaskTemplate } from '../../plan/plan.types';
import { QuickIntentRouterService } from './quick-intent-router.service';
import type { PerceptionState } from './perception.types';
import type { QuickRouterOutput } from './quick-intent-router.types';
import { ResponseComposer } from './response-composer.service';
import { TurnCognitiveStateService } from './turn-cognitive-state.service';

/**
 * AssistantOrchestrator - 主链路编排说明
 *
 * 所属层：
 *  - Router / Perception / Decision / Execution / Expression / Post-turn 的总编排入口
 *
 * 负责：
 *  - 串联 quick router、上下文组装、感知态补齐、统一决策、执行结果转表达、post-turn 调度
 *  - 在返回前输出统一的 pipeline / expression / post-turn 验证日志
 *
 * 不负责：
 *  - 不在这里新增具体 capability 业务逻辑
 *  - 不在这里重做意图识别实现细节
 *  - 不在这里绕过表达层直接拼接多套最终回复策略
 *
 * 输入：
 *  - 会话 id、用户输入、用户消息、运行时策略
 *
 * 输出：
 *  - 最终 SendMessageResult
 *
 * ⚠️ 约束：
 *  - 新能力优先接到显式分层 schema 与 executor / registry
 *  - 不得把历史兼容分支继续堆进 orchestrator 形成新的隐式职责
 */
@Injectable()
export class AssistantOrchestrator {
  private readonly logger = new Logger(AssistantOrchestrator.name);

  constructor(
    private readonly assembler: TurnContextAssembler,
    private readonly flags: FeatureFlagConfig,
    private readonly reflectionService: ReflectionService,
    private readonly completionRunner: ChatCompletionRunner,
    private readonly responseComposer: ResponseComposer,
    private readonly turnCognitiveState: TurnCognitiveStateService,
    private readonly postTurnPipeline: PostTurnPipeline,
    private readonly postTurnPlanBuilder: PostTurnPlanBuilder,
    private readonly summarizeTrigger: SummarizeTriggerService,
    private readonly interactionTuningLearner: InteractionTuningLearner,
    private readonly sessionState: SessionStateService,
    private readonly claimUpdate: ClaimUpdateService,
    private readonly claimConfig: ClaimEngineConfig,
    private readonly tracePointExtractor: TracePointExtractorService,
    private readonly socialEntityClassifier: SocialEntityClassifierService,
    private readonly socialEntity: SocialEntityService,
    private readonly socialRelationEdge: SocialRelationEdgeService,
    private readonly cognitiveGrowth: CognitiveGrowthService,
    private readonly observationEmitter: ObservationEmitterService,
    private readonly relationshipOverview: RelationshipOverviewService,
    private readonly sessionReflection: SessionReflectionService,
    private readonly planService: PlanService,
    private readonly ideaService: IdeaService,
    private readonly todoService: TodoService,
    private readonly prisma: PrismaService,
    private readonly quickRouter: QuickIntentRouterService,
    private readonly actionReasoner: ActionReasonerService,
  ) {}

  async processTurn(input: {
    conversationId: string;
    userId: string;
    userInput: string;
    userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    recentRounds: number;
    collaborationContext?: CollaborationTurnContext | null;
    runtimePolicy?: {
      allowPostTurn?: boolean;
      allowReflection?: boolean;
    };
  }): Promise<SendMessageResult> {
    const allowPostTurn = input.runtimePolicy?.allowPostTurn !== false;
    const allowReflection = input.runtimePolicy?.allowReflection !== false;
    let executionStage = 'pending';

    // Quick Intent Router: 在加载 Session State 之前分流，不依赖任何上下文
    let quickRoute: QuickRouterOutput;
    try {
      quickRoute = await this.quickRouter.route(input.userInput);
    } catch {
      quickRoute = { path: 'chat', confidence: 1.0, source: 'fallback' };
    }
    this.logger.debug(
      `[QuickRouter] source=${quickRoute.source} path=${quickRoute.path} `
      + `hint=${quickRoute.toolHint ?? '-'} confidence=${quickRoute.confidence.toFixed(2)}`,
    );

    let context: TurnContext;
    try {
      context = await this.assembler.assemble({
        conversationId: input.conversationId,
        userId: input.userId,
        userInput: input.userInput,
        userMessage: input.userMessage,
        now: new Date(),
        recentRounds: input.recentRounds,
        quickRoute,
        collaborationContext: input.collaborationContext ?? null,
      });
    } catch (err) {
      this.logger.warn(`assemble failed, fallback assembleFallback: ${String(err)}`);
      context = await this.assembler.assembleFallback({
        conversationId: input.conversationId,
        userId: input.userId,
        userInput: input.userInput,
        userMessage: input.userMessage,
        now: new Date(),
        recentRounds: Math.min(2, input.recentRounds),
        quickRoute,
        collaborationContext: input.collaborationContext ?? null,
      });
    }

    const cognitiveState = this.turnCognitiveState.analyze(context);
    const perceptionState: PerceptionState = {
      intentState: context.runtime.intentState ?? null,
      mergedIntentState: context.runtime.mergedIntentState ?? null,
      quickRoute: context.runtime.quickRoute ?? null,
      cognitiveState,
      emotionTrend: context.runtime.emotionTrend ?? null,
    };
    this.logger.debug(
      `[Perception] intent=${perceptionState.mergedIntentState?.taskIntent ?? 'none'} `
      + `cognitive=${perceptionState.cognitiveState.situation.kind} `
      + `quickPath=${perceptionState.quickRoute?.path ?? 'chat'}`,
    );
    const actionDecision = this.actionReasoner.decideFromPerception(perceptionState, input.userInput);
    const turnContext: TurnContext = {
      ...context,
      runtime: {
        ...context.runtime,
        cognitiveState,
        actionDecision,
      },
    };

    let policy: ToolPolicyDecision = { action: 'chat', reason: 'intent 未命中，默认聊天路径' };
    try {
      policy = actionDecision.toolPolicy ?? policy;
    } catch (err) {
      this.logger.warn(`resolve policy failed, fallback chat: ${String(err)}`);
    }

    let result: SendMessageResult;
    let postTurnPlan: PostTurnPlan | undefined;
    try {
      const completion = await this.completionRunner.execute(turnContext, policy);
      if (completion.result) {
        result = completion.result;
        executionStage = this.describeAssistantMessageStage(completion.result.assistantMessage);
        postTurnPlan = completion.postTurnPlan
          ?? (completion.postTurnMeta
            ? this.postTurnPlanBuilder.build({
                executionPath: completion.postTurnMeta.executionPath,
                conversationId: input.conversationId,
                userId: input.userId,
                userMsg: input.userMessage,
                assistantMsg: {
                  id: completion.result.assistantMessage.id,
                  content: completion.result.assistantMessage.content,
                },
                userInput: input.userInput,
                intentState: completion.postTurnMeta.intentState,
                actionDecision,
                cognitiveState: completion.postTurnMeta.cognitiveState,
                isImportantIssueInProgress: completion.postTurnMeta.isImportantIssueInProgress,
              })
            : undefined);
      } else if (completion.executionResult) {
        executionStage = this.describeExecutionStage(completion.executionResult);
        const composed = await this.composeExecutionReply(
          turnContext,
          input,
          completion.executionResult,
          perceptionState,
        );
        result = composed.result;
        postTurnPlan = composed.postTurnPlan;
      } else {
        throw new Error('Completion runner returned neither result nor executionResult');
      }
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
      executionStage = 'system_fallback';
      result = {
        userMessage: toConversationMessageDto(input.userMessage),
        assistantMessage: toConversationMessageDto(assistantMsg),
        injectedMemories: turnContext.memory.injectedMemories,
      };
    }

    if (postTurnPlan && allowPostTurn) {
      try {
        result = await this.runBeforeReturnPostTurn(postTurnPlan, result, turnContext);
      } catch (err) {
        this.logger.warn(`postTurn beforeReturn failed: ${String(err)}`);
      }
    }

    if (postTurnPlan && allowPostTurn) {
      this.postTurnPipeline.runAfterReturn(
        postTurnPlan,
        async (task, plan) => {
          const snapshot = this.snapshotPostTurnOps(plan);
          await this.runAfterReturnTask(task, plan, {
            toolPolicy: policy,
            allowReflection,
          });
          this.logPostTurnTaskCompletion('afterReturn', task, plan, snapshot);
        },
      ).catch((err) => this.logger.warn(`postTurn afterReturn failed: ${String(err)}`));
    }

    // 多意图：为延迟动作创建 Plan（异步，不阻塞返回）
    if (actionDecision?.deferredIntents?.length) {
      void this.scheduleDeferredIntentPlans(input.conversationId, input.userId, actionDecision);
    }

    this.logPipelineState({
      quickRoute,
      perceptionState,
      actionDecision,
      policy,
      executionStage,
      result,
      postTurnPlan,
      allowPostTurn,
    });
    this.logExpressionExit({
      quickRoute,
      executionStage,
      result,
    });

    return result;
  }

  private async composeExecutionReply(
    context: TurnContext,
    input: {
      conversationId: string;
      userId: string;
      userInput: string;
      userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    },
    execution: ExecutionResult,
    perceptionState: PerceptionState,
  ): Promise<{ result: SendMessageResult; postTurnPlan: PostTurnPlan }> {
    const resolvedIntentState = perceptionState.mergedIntentState ?? perceptionState.intentState ?? null;

    if (execution.path === 'chat') {
      const composition = await this.responseComposer.composeChatReply({
        context,
        recentMessages: context.conversation.recentMessages,
        personaDto: context.persona.personaDto,
        intentState: resolvedIntentState,
        maxContextTokens: this.flags.maxContextTokens,
        profilePrompt: {
          includeImpressionCore: this.flags.featureImpressionCore,
          includeImpressionDetail: this.flags.featureImpressionDetail && context.memory.needDetail,
        },
      });

      const assistantMsg = await this.persistAssistantMessage(
        input.conversationId,
        composition.replyContent,
      );
      const postTurnPlan = this.postTurnPlanBuilder.build({
        executionPath: 'chat',
        conversationId: input.conversationId,
        userId: input.userId,
        userMsg: input.userMessage,
        assistantMsg,
        userInput: input.userInput,
        intentState: resolvedIntentState,
        actionDecision: context.runtime.actionDecision,
        cognitiveState: composition.cognitiveState,
        isImportantIssueInProgress:
          composition.cognitiveState.situation.kind === 'decision_support' ||
          composition.cognitiveState.situation.kind === 'advice_request' ||
          composition.cognitiveState.situation.kind === 'task_execution',
      });

      return {
        result: {
          userMessage: toConversationMessageDto(input.userMessage),
          assistantMessage: toConversationMessageDto(assistantMsg),
          injectedMemories: context.memory.injectedMemories,
          ...(execution.debugMeta ? { debugMeta: execution.debugMeta } : {}),
          ...(execution.trace ? { trace: execution.trace } : {}),
        },
        postTurnPlan,
      };
    }

    if (execution.path === 'missing_params') {
      const composition = await this.responseComposer.composeMissingParamsReply({
        context,
        userInput: input.userInput,
        missingParams: execution.missingParams ?? [],
        personaDto: context.persona.personaDto,
        intentState: resolvedIntentState,
        profilePrompt: {
          includeImpressionCore: true,
          includeImpressionDetail: true,
        },
      });
      const assistantMsg = await this.persistAssistantMessage(
        input.conversationId,
        composition.replyContent,
      );
      const postTurnPlan = this.postTurnPlanBuilder.build({
        executionPath: 'missing_params',
        conversationId: input.conversationId,
        userId: input.userId,
        userMsg: input.userMessage,
        assistantMsg,
        userInput: input.userInput,
        intentState: resolvedIntentState,
        actionDecision: context.runtime.actionDecision,
        cognitiveState: composition.cognitiveState,
      });
      return {
        result: {
          userMessage: toConversationMessageDto(input.userMessage),
          assistantMessage: toConversationMessageDto(assistantMsg),
          injectedMemories: [],
          ...(execution.debugMeta ? { debugMeta: execution.debugMeta } : {}),
          ...(execution.trace ? { trace: execution.trace } : {}),
        },
        postTurnPlan,
      };
    }

    const composition = await this.responseComposer.composeToolReply({
      context,
      userInput: input.userInput,
      recentMessages: context.conversation.recentMessages,
      personaDto: context.persona.personaDto,
      intentState: resolvedIntentState,
      toolResult: execution.toolResult ?? null,
      toolError: execution.toolError ?? null,
      executionStatus: execution.status,
      toolKind: execution.toolKind ?? 'general_action',
      profilePrompt: {
        includeImpressionCore: true,
        includeImpressionDetail: true,
      },
      toolWasActuallyUsed: execution.toolWasActuallyUsed ?? false,
    });

    const assistantMsg = await this.persistAssistantMessage(
      input.conversationId,
      composition.replyContent,
      execution.messageKind ?? 'tool',
      {
        source: 'tool',
        toolKind: execution.toolKind ?? 'general_action',
        toolName: execution.toolKind ?? 'general_action',
        success: execution.status === 'success' && !execution.toolError,
        summary: this.firstLine(composition.replyContent) ?? undefined,
        ...(execution.messageMetadata ?? {}),
      },
    );
    const postTurnPlan = this.postTurnPlanBuilder.build({
      executionPath: 'tool',
      conversationId: input.conversationId,
      userId: input.userId,
      userMsg: input.userMessage,
      assistantMsg,
      userInput: input.userInput,
      intentState: resolvedIntentState,
      actionDecision: context.runtime.actionDecision,
      cognitiveState: composition.cognitiveState,
    });

    return {
      result: {
        userMessage: toConversationMessageDto(input.userMessage),
        assistantMessage: toConversationMessageDto(assistantMsg),
        injectedMemories: [],
        ...(execution.openclawUsed !== undefined ? { openclawUsed: execution.openclawUsed } : {}),
        ...(execution.localSkillUsed !== undefined ? { localSkillUsed: execution.localSkillUsed } : {}),
        ...(execution.debugMeta ? { debugMeta: execution.debugMeta } : {}),
        ...(execution.trace ? { trace: execution.trace } : {}),
      },
      postTurnPlan,
    };
  }

  private async captureStructuredWorkItem(
    context: TurnContext,
    result: SendMessageResult,
  ): Promise<SendMessageResult> {
    const decision = context.runtime.actionDecision;
    const workItemPolicy = decision?.workItemPolicy;
    if (!decision || !workItemPolicy?.shouldCapture || workItemPolicy.kind === 'none') {
      return result;
    }

    const capture = workItemPolicy.kind === 'idea'
      ? await this.captureIdeaFromDecision(context)
      : await this.captureTodoFromDecision(context, result, decision);

    if (!capture) {
      return result;
    }

    const captureMetadata = capture.kind === 'idea'
      ? {
          captureKind: capture.kind,
          ideaId: capture.ideaId,
          ...(capture.ideaTitle ? { ideaTitle: capture.ideaTitle } : {}),
        }
      : {
          captureKind: capture.kind,
          todoId: capture.todoId,
          ...(capture.todoTitle ? { todoTitle: capture.todoTitle } : {}),
          ...(capture.planTitle ? { planTitle: capture.planTitle } : {}),
          ...(capture.planId ? { planId: capture.planId } : {}),
        };

    const mergedMetadata = {
      ...(result.assistantMessage.metadata ?? {}),
      ...captureMetadata,
    };

    const assistantMsg = await this.prisma.message.update({
      where: { id: result.assistantMessage.id },
      data: {
        metadata: mergedMetadata as Prisma.InputJsonValue,
      },
    });

    return {
      ...result,
      assistantMessage: toConversationMessageDto(assistantMsg),
      meta: {
        ...(result.meta ?? {}),
        workCapture: capture,
      },
    };
  }

  private async captureIdeaFromDecision(context: TurnContext): Promise<{
    kind: 'idea';
    ideaId: string;
    ideaTitle?: string;
  } | null> {
    const content = context.request.userInput.trim();
    if (!content) return null;

    const idea = await this.ideaService.createIdea({
      title: this.deriveTitle(content),
      content,
    });

    return {
      kind: 'idea',
      ideaId: idea.id,
      ...(idea.title ? { ideaTitle: idea.title } : {}),
    };
  }

  private async captureTodoFromDecision(
    context: TurnContext,
    result: SendMessageResult,
    decision: ActionDecision,
  ): Promise<{
    kind: 'todo';
    todoId: string;
    todoTitle?: string;
    planId?: string;
    planTitle?: string;
  } | null> {
    const intentState = context.runtime.mergedIntentState ?? context.runtime.intentState;
    if (!intentState) return null;

    const reminderAction = this.readString(intentState.slots.reminderAction) ?? 'create';
    const reminderPlanId = this.readString(result.assistantMessage.metadata?.reminderId);

    if (intentState.taskIntent === 'set_reminder' && reminderAction !== 'create' && !reminderPlanId) {
      return null;
    }

    const sourceText = context.request.userInput.trim();
    if (!sourceText) return null;

    const todoTitle = this.deriveTodoTitle(intentState, sourceText);
    const missingPrompt = this.buildTodoBlockReason(intentState.missingParams);
    const todo = await this.todoService.createTodo({
      title: todoTitle,
      description: this.deriveTodoDescription(intentState, sourceText),
      dueAt: this.deriveTodoDueAt(intentState),
      ...(missingPrompt
        ? {
            status: 'blocked',
            blockReason: missingPrompt,
          }
        : {}),
    }) as unknown as { id: string };

    if (missingPrompt && !reminderPlanId) {
      return {
        kind: 'todo',
        todoId: todo.id,
        ...(todoTitle ? { todoTitle } : {}),
      };
    }

    let planId: string | undefined;
    let planTitle: string | undefined;
    if (reminderPlanId) {
      planId = await this.attachPlanToTodo(reminderPlanId, todo.id);
    } else if (decision.planIntent?.type === 'notify') {
      const plan = await this.createNotifyPlanForTodo(context, todo.id, intentState);
      planId = plan?.id;
      planTitle = plan?.title ?? undefined;
    }

    return {
      kind: 'todo',
      todoId: todo.id,
      ...(todoTitle ? { todoTitle } : {}),
      ...(planId ? { planId } : {}),
      ...(planTitle ? { planTitle } : {}),
    };
  }

  private buildTodoBlockReason(missingParams: string[]): string | null {
    if (!missingParams.length) {
      return null;
    }
    const labels = missingParams
      .map((name) => this.mapMissingParamLabel(name))
      .filter(Boolean);
    if (!labels.length) {
      return '还缺少一些必要信息，等你补充后我再继续。';
    }
    return `待补充：${labels.join('、')}`;
  }

  private mapMissingParamLabel(name: string): string | null {
    if (name === 'reminderTime') return '提醒时间';
    if (name === 'reminderRunAt') return '提醒时间';
    if (name === 'reminderWeekday') return '提醒星期';
    if (name === 'city' || name === 'location') return '地点';
    if (name === 'timesheetDate') return '工时日期';
    if (name === 'timesheetMonth') return '工时月份';
    return name.trim() || null;
  }

  private async attachPlanToTodo(planId: string, todoId: string): Promise<string | undefined> {
    try {
      const plan = await this.prisma.plan.update({
        where: { id: planId },
        data: { sourceTodoId: todoId },
        select: { id: true },
      });
      return plan.id;
    } catch (err) {
      this.logger.warn(`attach plan to todo failed: ${String(err)}`);
      return undefined;
    }
  }

  private async createNotifyPlanForTodo(
    context: TurnContext,
    todoId: string,
    intentState: NonNullable<TurnContext['runtime']['mergedIntentState'] | TurnContext['runtime']['intentState']>,
  ) {
    const reminderReason = this.readString(intentState.slots.reminderReason)
      ?? this.deriveTodoTitle(intentState, context.request.userInput);
    if (!reminderReason) return null;

    const recurrence = this.readString(intentState.slots.reminderSchedule) ?? 'once';
    const schedule = this.buildPlanSchedule(intentState.slots);
    if (!schedule) return null;

    try {
      return await this.planService.createPlan({
        title: reminderReason,
        description: reminderReason,
        scope: ReminderScope.chat,
        dispatchType: PlanDispatchType.notify,
        recurrence,
        timezone: 'Asia/Shanghai',
        conversationId: context.request.conversationId,
        sourceTodoId: todoId,
        ...schedule,
      }, context.request.userId);
    } catch (err) {
      this.logger.warn(`create notify plan for todo failed: ${String(err)}`);
      return null;
    }
  }

  private buildPlanSchedule(slots: Record<string, unknown>): { runAt?: string; cronExpr?: string } | null {
    const schedule = this.readString(slots.reminderSchedule) ?? 'once';
    if (schedule === 'once') {
      const runAt = this.readString(slots.reminderRunAt);
      return runAt ? { runAt } : null;
    }

    const time = this.parseHHMM(this.readString(slots.reminderTime));
    if (!time) return null;

    if (schedule === 'daily') {
      return { cronExpr: `${time.minute} ${time.hour} * * *` };
    }
    if (schedule === 'weekday') {
      return { cronExpr: `${time.minute} ${time.hour} * * 1-5` };
    }
    if (schedule === 'weekly') {
      const weekday = typeof slots.reminderWeekday === 'number' ? slots.reminderWeekday : null;
      if (weekday === null || weekday < 0 || weekday > 6) return null;
      return { cronExpr: `${time.minute} ${time.hour} * * ${weekday}` };
    }

    return null;
  }

  private deriveTodoTitle(
    intentState: NonNullable<TurnContext['runtime']['mergedIntentState'] | TurnContext['runtime']['intentState']>,
    sourceText: string,
  ): string {
    return this.readString(intentState.slots.reminderReason)
      ?? this.deriveTitle(sourceText);
  }

  private deriveTodoDescription(
    intentState: NonNullable<TurnContext['runtime']['mergedIntentState'] | TurnContext['runtime']['intentState']>,
    sourceText: string,
  ): string {
    return this.readString(intentState.slots.reminderReason)
      ?? sourceText.trim();
  }

  private deriveTodoDueAt(
    intentState: NonNullable<TurnContext['runtime']['mergedIntentState'] | TurnContext['runtime']['intentState']>,
  ): string | undefined {
    const schedule = this.readString(intentState.slots.reminderSchedule);
    const runAt = this.readString(intentState.slots.reminderRunAt);
    if (schedule === 'once' && runAt) {
      return runAt;
    }
    return undefined;
  }

  private deriveTitle(content: string): string {
    return content.trim().split('\n')[0]?.slice(0, 48) || '未命名记录';
  }

  private parseHHMM(value?: string): { hour: number; minute: number } | null {
    const raw = value?.trim();
    if (!raw) return null;
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  /**
   * 为多意图场景中的延迟动作创建 Plan。
   * 每个延迟 intent 根据其类型映射为对应的 capability + params，
   * 通过 PlanService 创建 action 类型的 Plan。
   */
  private async createPlansForDeferredIntents(
    conversationId: string,
    userId: string,
    decision: ActionDecision,
  ): Promise<void> {
    const deferred = decision.deferredIntents;
    if (!deferred?.length) return;

    for (const item of deferred) {
      try {
        const template = this.intentToTaskTemplate(item);
        if (!template) {
          this.logger.warn(`Cannot map deferred intent ${item.intent} to task template, skipping`);
          continue;
        }

        // 对于立即执行的意图（immediate=true），创建 runAt=now 的一次性 Plan
        // 对于延迟执行的意图（有时间信息），从 slots 中提取时间
        const runAt = item.immediate !== false
          ? new Date()
          : this.extractRunAtFromSlots(item.slots) ?? new Date();

        await this.planService.createPlan({
          title: `多意图延迟任务：${item.intent}`,
          description: this.buildDeferredDescription(item),
          scope: 'chat',
          dispatchType: PlanDispatchType.action,
          recurrence: 'once',
          runAt,
          conversationId,
          actionPayload: {
            capability: template.action,
            params: template.params ?? {},
          },
          taskTemplates: [template],
        }, userId);

        this.logger.log(`Created deferred plan for intent=${item.intent}, conversationId=${conversationId}`);
      } catch (err) {
        this.logger.warn(`Failed to create deferred plan for ${item.intent}: ${String(err)}`);
      }
    }
  }

  private async scheduleDeferredIntentPlans(
    conversationId: string,
    userId: string,
    decision: ActionDecision,
  ): Promise<void> {
    try {
      await this.createPlansForDeferredIntents(conversationId, userId, decision);
    } catch (err) {
      this.logger.warn(`deferred intents plan creation failed: ${String(err)}`);
    }
  }

  /** 将 TaskIntentItem 映射为 TaskTemplate */
  private intentToTaskTemplate(item: TaskIntentItem): TaskTemplate | null {
    const intentCapabilityMap: Record<string, string> = {
      weather_query: 'weather',
      book_download: 'book-download',
      timesheet: 'timesheet',
      set_reminder: 'reminder',
      checkin: 'checkin',
    };

    const capability = intentCapabilityMap[item.intent];
    if (!capability) return null;

    return {
      action: capability,
      params: (item.slots as Record<string, unknown>) ?? {},
      mode: 'execute',
    };
  }

  /** 从 slots 中提取执行时间（主要用于 set_reminder 类延迟意图） */
  private extractRunAtFromSlots(slots?: Record<string, unknown>): Date | null {
    if (!slots) return null;
    const time = slots.reminderTime;
    if (typeof time === 'string' && time.includes('T')) {
      const d = new Date(time);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  private buildDeferredDescription(item: TaskIntentItem): string {
    const parts = [`意图：${item.intent}`];
    if (item.slots?.reminderReason) parts.push(`内容：${String(item.slots.reminderReason)}`);
    if (item.slots?.city) parts.push(`城市：${String(item.slots.city)}`);
    return parts.join('，');
  }

  private async runBeforeReturnPostTurn(
    plan: PostTurnPlan,
    initialResult: SendMessageResult,
    context: TurnContext,
  ): Promise<SendMessageResult> {
    let result = initialResult;
    await this.postTurnPipeline.runBeforeReturn(plan, async (task, currentPlan) => {
      const snapshot = this.snapshotPostTurnOps(currentPlan);
      result = await this.runBeforeReturnTask(task, currentPlan, result, context);
      this.logPostTurnTaskCompletion('beforeReturn', task, currentPlan, snapshot);
    });
    return result;
  }

  private async runBeforeReturnTask(
    task: PostTurnTask,
    plan: PostTurnPlan,
    result: SendMessageResult,
    context: TurnContext,
  ): Promise<SendMessageResult> {
    if (task.type === 'capture_work_item') {
      return this.captureStructuredWorkItem(context, result);
    }
    return result;
  }

  private async persistAssistantMessage(
    conversationId: string,
    content: string,
    kind: ConversationMessageKind = 'chat',
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        kind,
        content,
        ...(metadata !== undefined
          ? { metadata: metadata as Prisma.InputJsonValue }
          : {}),
        tokenCount: estimateTokens(content),
      },
    });
  }

  private firstLine(text: string | null | undefined): string | undefined {
    const normalized = String(text ?? '').trim();
    if (!normalized) return undefined;
    return normalized.split(/\r?\n/).find((line) => line.trim())?.trim() ?? normalized;
  }

  private describeExecutionStage(execution: ExecutionResult): string {
    if (execution.path === 'missing_params') {
      return 'missing_params';
    }
    if (execution.path === 'chat') {
      return 'chat';
    }

    const toolKind = execution.toolKind ?? 'general_action';
    const suffix = execution.status === 'failed' ? ':failed' : ':success';
    return `tool:${toolKind}${suffix}`;
  }

  private describeAssistantMessageStage(message: SendMessageResult['assistantMessage']): string {
    const source = message.metadata?.source ?? 'assistant';
    const toolKind = message.metadata?.toolKind;
    return toolKind ? `${source}:${toolKind}` : `${source}:${message.kind}`;
  }

  private describePostTurnForPipeline(
    plan: PostTurnPlan | undefined,
    allowPostTurn: boolean,
  ): string {
    if (!allowPostTurn) return 'disabled';
    if (!plan) return 'none';
    const before = plan.beforeReturn.map((task) => task.type).join('|') || 'none';
    const after = plan.afterReturn.map((task) => task.type).join('|') || 'none';
    return `before:${before};after:${after}`;
  }

  private logPipelineState(input: {
    quickRoute: QuickRouterOutput;
    perceptionState: PerceptionState;
    actionDecision: ActionDecision;
    policy: ToolPolicyDecision;
    executionStage: string;
    result: SendMessageResult;
    postTurnPlan?: PostTurnPlan;
    allowPostTurn: boolean;
  }): void {
    this.logger.debug(
      `[Pipeline] route=${input.quickRoute.path} `
      + `perception=intent:${input.perceptionState.mergedIntentState?.taskIntent ?? 'none'},`
      + `cognitive:${input.perceptionState.cognitiveState.situation.kind} `
      + `decision=${input.actionDecision.action}/${input.policy.action} `
      + `execution=${input.executionStage} `
      + `expression=${input.result.assistantMessage.kind}:${input.result.assistantMessage.metadata?.source ?? 'assistant'} `
      + `postTurn=${this.describePostTurnForPipeline(input.postTurnPlan, input.allowPostTurn)}`,
    );
  }

  private logExpressionExit(input: {
    quickRoute: QuickRouterOutput;
    executionStage: string;
    result: SendMessageResult;
  }): void {
    this.logger.debug(
      `[Expression] outlet=assistant-orchestrator route=${input.quickRoute.path} `
      + `via=${input.executionStage} source=${input.result.assistantMessage.metadata?.source ?? 'assistant'} `
      + `kind=${input.result.assistantMessage.kind} messageId=${input.result.assistantMessage.id}`,
    );
  }

  private snapshotPostTurnOps(plan: PostTurnPlan): {
    memoryOps: number;
    claimOps: number;
    growthOps: number;
  } {
    return {
      memoryOps: plan.opsCollector.memoryOps.length,
      claimOps: plan.opsCollector.claimOps.length,
      growthOps: plan.opsCollector.growthOps.length,
    };
  }

  private logPostTurnTaskCompletion(
    phase: 'beforeReturn' | 'afterReturn',
    task: PostTurnTask,
    plan: PostTurnPlan,
    snapshot: {
      memoryOps: number;
      claimOps: number;
      growthOps: number;
    },
  ): void {
    const memoryDelta = plan.opsCollector.memoryOps.length - snapshot.memoryOps;
    const claimDelta = plan.opsCollector.claimOps.length - snapshot.claimOps;
    const growthDelta = plan.opsCollector.growthOps.length - snapshot.growthOps;
    const writes = this.describePostTurnWrites(task, {
      memoryDelta,
      claimDelta,
      growthDelta,
    });

    this.logger.debug(
      `[PostTurn] phase=${phase} executed=true task=${task.type} `
      + `writes=${writes} conversationId=${plan.conversationId}`,
    );
  }

  private describePostTurnWrites(
    task: PostTurnTask,
    delta: { memoryDelta: number; claimDelta: number; growthDelta: number },
  ): string {
    const writes: string[] = [];
    if (delta.memoryDelta > 0) writes.push(`memory:${delta.memoryDelta}`);
    if (delta.claimDelta > 0) writes.push(`claim:${delta.claimDelta}`);
    if (delta.growthDelta > 0) writes.push(`growth:${delta.growthDelta}`);

    if (task.type === 'life_record_sync') writes.push('relation');
    if (task.type === 'record_emotion_snapshot') writes.push('emotion');
    if (task.type === 'record_cognitive_observation') writes.push('observation');
    if (task.type === 'session_reflection') writes.push('relation');
    if (task.type === 'decision_quality_review') writes.push('reflection');
    if (task.type === 'capture_work_item') writes.push('work_item');

    return writes.join('|') || 'none';
  }

  private async runAfterReturnTask(
    task: PostTurnTask,
    plan: PostTurnPlan,
    runtime?: {
      toolPolicy?: ToolPolicyDecision;
      allowReflection?: boolean;
    },
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
      ], plan.userId);

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

    if (task.type === 'record_emotion_snapshot') {
      const cognitiveState = plan.context.cognitiveState;
      if (!cognitiveState) return;

      const emotionSourceSignal = cognitiveState.userState.signals.find((signal) =>
        signal.startsWith('emotion-source:'),
      );
      const source = emotionSourceSignal?.split(':', 2)[1] ?? 'cognitive_pipeline';
      const llmConfidence = plan.context.intentState?.detectedEmotion === cognitiveState.userState.emotion
        ? plan.context.intentState?.confidence
        : undefined;

      await recordEmotionSnapshot(this.prisma, {
        conversationId: plan.conversationId,
        emotion: cognitiveState.userState.emotion,
        fragility: cognitiveState.userState.fragility,
        confidence: llmConfidence ?? 0.5,
        source,
        rawInput: plan.turn.userInput,
      });
      return;
    }

    if (task.type === 'interaction_tuning_learning') {
      const result = await this.interactionTuningLearner.learn(plan);
      plan.opsCollector.claimOps.push(...result.claimOps);
      return;
    }

      if (task.type === 'summarize_trigger') {
      if (task.trigger === 'flush') {
        await this.summarizeTrigger.flushSummarize(plan.conversationId, plan.userId);
        return;
      }
      const ops = await this.summarizeTrigger.maybeAutoSummarize(
        plan.conversationId,
        plan.turn.userInput,
        plan.userId,
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
      return;
    }

    if (task.type === 'decision_quality_review') {
      if (runtime?.allowReflection === false) return;
      await this.runDecisionQualityReview(plan, runtime?.toolPolicy);
      return;
    }

    if (task.type === 'auto_evolution_after_summary') {
      // TODO: not yet implemented. 保留类型是为了与 post-turn schema 对齐，当前 runner 显式跳过。
      this.logger.debug('post-turn task auto_evolution_after_summary is not implemented yet');
    }
  }

  private async runDecisionQualityReview(
    plan: PostTurnPlan,
    toolPolicy?: ToolPolicyDecision,
  ): Promise<void> {
    const intentState = plan.context.intentState;
    const actionDecision = plan.context.actionDecision;

    const reflection = this.reflectionService.reflect({
      userInput: plan.turn.userInput,
      intentState: intentState ? {
        taskIntent: intentState.taskIntent,
        confidence: intentState.confidence,
        requiresTool: intentState.requiresTool,
      } : undefined,
      actionDecision: actionDecision ? {
        action: actionDecision.action,
        reason: actionDecision.reason,
        confidence: actionDecision.confidence,
      } : undefined,
      toolPolicy: toolPolicy
        ? { action: toolPolicy.action, capability: toolPolicy.capability }
        : undefined,
      assistantOutput: plan.turn.assistantOutput,
      hasError: false,
    });

    if (reflection.quality !== 'good') {
      this.logger.warn(`Reflection: ${reflection.quality} - ${reflection.issues?.join('; ')}`);
    }

    if (!reflection.adjustmentHint) {
      return;
    }

    try {
      await this.sessionState.upsertState({
        userKey: plan.userId,
        sessionId: plan.conversationId,
        state: {
          lastReflection: {
            quality: reflection.quality,
            adjustmentHint: reflection.adjustmentHint,
            timestamp: new Date(),
          },
        },
        confidence: 0.8,
        ttlSeconds: 21600,
        sourceModel: 'reflection-service',
      });
    } catch (err) {
      this.logger.warn(`Failed to persist reflection: ${String(err)}`);
    }
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
      const overview = await this.relationshipOverview.getOverview(plan.userId);
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
        userKey: plan.userId,
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
        this.socialEntity.syncFromTracePointIds(createdTracePointIds, plan.userId),
        this.socialRelationEdge.syncFromTracePointIds(createdTracePointIds, plan.userId),
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
          userId: plan.userId,
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
        this.socialEntity.syncFromTracePointIds(tracePointIds, plan.userId),
        this.socialRelationEdge.syncFromTracePointIds(tracePointIds, plan.userId),
      ]);

      if (entitySync.entityIds.length > 0) {
        await this.socialEntityClassifier.classifyPending({
          userId: plan.userId,
          entityIds: entitySync.entityIds,
          limit: Math.min(entitySync.entityIds.length, 4),
        });
      }
    } catch (err) {
      this.logger.warn(`life record sync failed: ${String(err)}`);
    }
  }
}
