import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import { LlmService } from '../../infra/llm/llm.service';
import { CHAT_PROMPT_VERSION } from '../prompt-router/prompt-router.service';
import { MemoryDecayService } from '../memory/memory-decay.service';
import { PersonaDto } from '../persona/persona.service';
import type { DialogueIntentState } from '../intent/intent.types';
import { TaskFormatterService } from '../../openclaw/task-formatter.service';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import { WeatherSkillService } from '../../action/skills/weather/weather-skill.service';
import { PetService } from '../pet/pet.service';
import type { CognitiveTurnState } from '../cognitive-pipeline/cognitive-pipeline.types';
import { estimateTokens } from '../../infra/token-estimator';
import { TraceCollector } from '../../infra/trace/trace-collector';
import { adaptLegacyTraceToTurnEvents } from '../../infra/trace/turn-trace.adapter';
import { DailyMomentService } from '../life-record/daily-moment/daily-moment.service';
import type {
  ChatCompletionResult,
  ConversationMessageKind,
  ConversationMessageMetadata,
  SendMessageResult,
  ToolPolicyDecision,
  TurnContext,
} from './orchestration.types';
import { ToolExecutorRegistry } from '../../action/tools/tool-executor-registry.service';
import type { PostTurnPlan } from '../post-turn/post-turn.types';
import { SkillRunner } from '../../action/local-skills/skill-runner.service';
import { FeatureFlagConfig } from './feature-flag.config';
import { ResponseComposer } from './response-composer.service';
import { toConversationMessageDto } from './message.dto';

type PipelineStepName = 'cognition' | 'decision' | 'expression';

interface PipelineTraceState {
  currentStep: PipelineStepName | 'idle';
  events: number;
  seen: Set<PipelineStepName>;
  firstSeenOrder: PipelineStepName[];
  canonicalOrder: PipelineStepName[];
  canonicalMatchSoFar: boolean;
}

interface PersistedAssistantMessageOptions {
  kind?: ConversationMessageKind;
  metadata?: ConversationMessageMetadata;
}

@Injectable()
export class ChatCompletionEngine {
  // ── 基础参数 ──────────────────────────────────────────────
  private readonly lastNRounds: number;
  private readonly memoryMidK: number;
  private readonly maxContextTokens: number;

  // ── System prompt token 预算 ──────────────────────────────
  private readonly maxSystemTokens: number;

  // ── 候选集参数 ────────────────────────────────────────────
  private readonly memoryCandidatesMaxLong: number;
  private readonly memoryCandidatesMaxMid: number;
  private readonly minCandidatesForLlmRank: number;
  private readonly memoryContentMaxChars: number;
  private readonly memoryMinRelevanceScore: number;

  // ── Feature flags ─────────────────────────────────────────
  /** 注入核心印象到 system prompt（默认 on） */
  private readonly featureImpressionCore: boolean;
  /** needDetail 时注入可选细节（默认 off） */
  private readonly featureImpressionDetail: boolean;
  /** 候选集 + 关键词预筛（默认 on，关闭则退回全量注入） */
  private readonly featureKeywordPrefilter: boolean;
  /** LLM 精排（默认 off，成本较高） */
  private readonly featureLlmRank: boolean;
  /** Budget-aware 动态 Top-K（默认 on） */
  private readonly featureDynamicTopK: boolean;
  /** 使用 shortSummary 注入（默认 off，Phase3） */
  private readonly featureShortSummary: boolean;
  /** 返回 debugMeta / trace 调试信息（默认 off） */
  private readonly featureDebugMeta: boolean;
  /** OpenClaw 集成（默认 off） */
  private readonly featureOpenClaw: boolean;
  /** OpenClaw 意图置信度阈值 */
  private readonly openclawConfidenceThreshold: number;
  private static readonly SKILL_COMMAND_RE = /^\/skill\s+([a-z0-9-]+)\s*$/;

  private readonly logger = new Logger(ChatCompletionEngine.name);

  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
    private memoryDecay: MemoryDecayService,
    private taskFormatter: TaskFormatterService,
    private capabilityRegistry: CapabilityRegistry,
    private weatherSkill: WeatherSkillService,
    private pet: PetService,
    private dailyMoment: DailyMomentService,
    private toolRegistry: ToolExecutorRegistry,
    private localSkillRunner: SkillRunner,
    private responseComposer: ResponseComposer,
    flags: FeatureFlagConfig,
  ) {
    this.lastNRounds = flags.lastNRounds;
    this.memoryMidK = flags.memoryMidK;
    this.maxContextTokens = flags.maxContextTokens;
    this.maxSystemTokens = flags.maxSystemTokens;
    this.memoryCandidatesMaxLong = flags.memoryCandidatesMaxLong;
    this.memoryCandidatesMaxMid = flags.memoryCandidatesMaxMid;
    this.minCandidatesForLlmRank = flags.minCandidatesForLlmRank;
    this.memoryContentMaxChars = flags.memoryContentMaxChars;
    this.memoryMinRelevanceScore = flags.memoryMinRelevanceScore;

    this.featureImpressionCore = flags.featureImpressionCore;
    this.featureImpressionDetail = flags.featureImpressionDetail;
    this.featureKeywordPrefilter = flags.featureKeywordPrefilter;
    this.featureLlmRank = flags.featureLlmRank;
    this.featureDynamicTopK = flags.featureDynamicTopK;
    this.featureShortSummary = flags.featureShortSummary;
    this.featureDebugMeta = flags.featureDebugMeta;
    this.featureOpenClaw = flags.featureOpenClaw;
    this.openclawConfidenceThreshold = flags.openclawConfidenceThreshold;
  }



  async execute(
    context: TurnContext,
    policy: ToolPolicyDecision,
  ): Promise<ChatCompletionResult> {
    return this.processTurnInternal(context, policy);
  }

  private async processTurnInternal(
    context: TurnContext,
    forcedPolicy: ToolPolicyDecision,
  ): Promise<ChatCompletionResult> {
    const { conversationId, userInput: content, userMessage: userMsg } = context.request;
    const trace = new TraceCollector(this.featureDebugMeta);
    const pipelineState = this.createPipelineTraceState();

    this.pet.setState('thinking');

    const recent = context.conversation.recentMessages;
    const personaDto = context.persona.personaDto;
    const now = context.request.now;
    const localSkillName = this.parseLocalSkillCommand(content);
    if (localSkillName) {
      return this.handleLocalSkillCommand(
        conversationId,
        userMsg,
        content,
        localSkillName,
        trace,
      );
    }

    const dailyMomentIntent = await this.dailyMoment.detectUserTriggerIntent(
      conversationId,
      content,
      now,
    );
    if (dailyMomentIntent.shouldGenerate && dailyMomentIntent.mode) {
      this.advancePipelineState(pipelineState, 'decision');

      const generated = await this.dailyMoment.generateMomentEntry({
        conversationId,
        now,
        triggerMode: dailyMomentIntent.mode,
      });
      this.recordPipelineStep(trace, pipelineState, 'expression', {
        path: 'daily-moment-manual',
        phase: 'post-llm',
        triggerMode: dailyMomentIntent.mode,
        sourceMessageCount: generated.record.sourceMessageIds.length,
      });

      const assistantMsg = await this.prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          kind: 'daily_moment',
          content: generated.renderedText,
          metadata: {
            source: 'daily-moment',
            triggerMode: dailyMomentIntent.mode,
            summary: generated.record.title,
          },
          tokenCount: estimateTokens(generated.renderedText),
        },
      });

      this.pet.setStateWithAutoIdle('speaking', 2000);

      return this.wrapResult({
        userMessage: toConversationMessageDto(userMsg),
        assistantMessage: toConversationMessageDto(assistantMsg),
        injectedMemories: [],
        dailyMoment: {
          mode: 'entry',
          record: generated.record,
        },
        ...(trace && { trace: trace.getTrace() }),
      });
    }

    // Claw 为被动工具层，仅工具型请求才调用；闲聊/思考/情绪不经过 Claw。
    // ── 意图识别 + OpenClaw 分流 ──────────────────────────
    const intentState: DialogueIntentState | null =
      context.runtime.mergedIntentState
      ?? context.runtime.intentState
      ?? null;
    if (intentState) {
      // 意图和槽位合并已由 TurnContextAssembler 完成，直接使用 mergedIntentState
      const merged = context.runtime.mergedIntentState ?? intentState;
      const policy = forcedPolicy;
      this.advancePipelineState(pipelineState, 'decision');
      trace.add('policy-decision', '策略决策', 'success', {
        decisionRoute: policy.action,
        reason: policy.reason,
        confidence: merged.confidence,
        threshold: this.openclawConfidenceThreshold,
        taskIntent: merged.taskIntent,
        requiresTool: merged.requiresTool,
        missingParams: merged.missingParams,
        pipeline: this.buildPipelineSnapshot(pipelineState),
        unifiedDecision: context.runtime.actionDecision
          ? {
              action: context.runtime.actionDecision.action,
              route: context.runtime.actionDecision.toolPolicy.action,
              source: context.runtime.actionDecision.source,
              capability: context.runtime.actionDecision.capability,
              targetKind: context.runtime.actionDecision.targetKind,
              planIntent: context.runtime.actionDecision.planIntent?.type ?? null,
            }
          : undefined,
      });
      if (policy.action === 'ask_missing') {
        return this.handleMissingParamsReply(
          context,
          conversationId,
          userMsg,
          content,
          merged.missingParams,
          merged,
          personaDto,
          trace,
          pipelineState,
        );
      }
      if (policy.action === 'run_capability') {
        const routed = await this.routeCapability(
          context,
          policy.capability ?? '',
          conversationId,
          userMsg,
          recent,
          content,
          merged,
          personaDto,
          trace,
          pipelineState,
        );
        if (routed) return routed;
      }
      if (policy.action === 'run_openclaw') {
        if (!this.featureOpenClaw) {
          this.logger.debug('OpenClaw 已关闭，工具意图回退聊天');
          return this.buildToolReplyAndSave(
            context,
            conversationId,
            userMsg,
            content,
            personaDto,
            null,
            'OpenClaw 已关闭，暂无法执行该任务',
            merged,
            {},
            trace,
            pipelineState,
            recent,
          );
        }
        return this.handleOpenClawTask(
          context,
          conversationId,
          userMsg,
          recent,
          content,
          merged,
          personaDto,
          trace,
          pipelineState,
        );
      }
    } else {
      trace.add('intent', '意图识别', 'skip', {
        reason: '意图未识别或无可用能力，走聊天路径',
      });
      this.advancePipelineState(pipelineState, 'decision');
    }

    if (!pipelineState.seen.has('decision')) {
      this.advancePipelineState(pipelineState, 'decision');
    }

    // ── 原有聊天路径 ──────────────────────────────────────
    return this.handleChatReply(
      context,
      conversationId,
      userMsg,
      recent,
      personaDto,
      trace,
      pipelineState,
      intentState,
    );
  }

  private parseLocalSkillCommand(input: string): string | null {
    const matched = String(input ?? '').trim().match(ChatCompletionEngine.SKILL_COMMAND_RE);
    return matched?.[1] ?? null;
  }

  private async handleLocalSkillCommand(
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    userInput: string,
    skillName: string,
    trace: TraceCollector,
  ): Promise<ChatCompletionResult> {
    const localSkillRun = await trace.wrap('skill-attempt', '本地技能命令', async () => {
      const result = await this.localSkillRunner.run({
        skill: skillName,
        conversationId,
        turnId: userMsg.id,
        userInput,
      });
      const status: 'success' | 'fail' = result.success ? 'success' : 'fail';
      return {
        status,
        detail: {
          skill: result.skill,
          success: result.success,
          summary: result.summary,
          stepCount: result.steps.length,
          stepResults: result.steps.map((step) => ({
            index: step.index,
            id: step.id,
            capability: step.capability,
            success: step.success,
            error: step.error,
          })),
        },
        result,
      };
    });

    this.pet.setStateWithAutoIdle('speaking', 1500);

    const assistantMsg = await this.persistAssistantMessage(
      conversationId,
      localSkillRun.summary,
      {
        kind: 'tool',
        metadata: {
          source: 'tool',
          toolKind: 'local_skill',
          toolName: skillName,
          success: localSkillRun.success,
          summary: localSkillRun.summary,
        },
      },
    );

    return this.wrapResult({
      userMessage: toConversationMessageDto(userMsg),
      assistantMessage: toConversationMessageDto(assistantMsg),
      injectedMemories: [],
      meta: {
        localSkillRun,
      },
      ...(trace && { trace: trace.getTrace() }),
    });
  }

  /** 经度,纬度 格式（和风约定），与 intent/weather 一致 */
  private static readonly COORD_REGEX = /^-?\d+(\.\d{1,2})?,\s*-?\d+(\.\d{1,2})?$/;

  private takeValidCoord(value: unknown): string | undefined {
    const s = typeof value === 'string' ? value.trim() : '';
    return s && ChatCompletionEngine.COORD_REGEX.test(s) ? s : undefined;
  }

  private buildTimesheetParams(
    slots: DialogueIntentState['slots'],
    userInput: string,
  ): Record<string, unknown> {
    const params = { ...(slots as Record<string, unknown>) };
    const action = typeof params.timesheetAction === 'string' ? params.timesheetAction.trim() : '';
    if (action !== 'confirm') return params;

    const slotOverride = typeof params.timesheetRawOverride === 'string'
      ? params.timesheetRawOverride.trim()
      : '';
    if (slotOverride) {
      params.rawOverride = slotOverride;
      return params;
    }

    const inferred = this.inferTimesheetRawOverride(userInput);
    if (inferred) {
      params.rawOverride = inferred;
    }
    return params;
  }

  private inferTimesheetRawOverride(userInput: string): string | undefined {
    const text = String(userInput ?? '').trim();
    if (!text) return undefined;
    const lines = text
      .split(/[\n;；]/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return undefined;

    const overrideLinePattern = /\s+\d+(?:\.\d+)?\s*(?:[hH]|小时)?\s*$/;
    return lines.every((line) => overrideLinePattern.test(line)) ? text : undefined;
  }

  private async routeCapability(
    context: TurnContext,
    capability: string,
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    recent: Array<{ role: string; content: string }>,
    userInput: string,
    intentState: DialogueIntentState,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
  ): Promise<ChatCompletionResult | null> {
    if (capability === 'weather') {
      return this.handleWeatherCapability(
        context,
        conversationId,
        userMsg,
        recent,
        userInput,
        intentState,
        personaDto,
        trace,
        pipelineState,
      );
    }

    if (capability === 'book-download') {
      return this.handleBookDownloadCapability(
        context,
        conversationId,
        userMsg,
        recent,
        userInput,
        intentState,
        personaDto,
        trace,
        pipelineState,
      );
    }

    const simpleRequest = this.buildSimpleCapabilityRequest(capability, intentState, userInput);
    if (!simpleRequest) return null;

    return this.executeCapabilityGeneric(
      context,
      simpleRequest.capabilityName,
      conversationId,
      userMsg,
      userInput,
      simpleRequest.params,
      intentState,
      personaDto,
      trace,
      pipelineState,
      recent,
      simpleRequest.localSkillUsed,
      simpleRequest.options,
    );
  }

  private async handleWeatherCapability(
    context: TurnContext,
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    recent: Array<{ role: string; content: string }>,
    userInput: string,
    intentState: DialogueIntentState,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
  ): Promise<ChatCompletionResult> {
    let location = this.takeValidCoord(intentState.slots.location);
    let geoResolved: string | null = null;

    if (!location && intentState.slots.city) {
      geoResolved = await this.weatherSkill.resolveCityToLocation(
        intentState.slots.city,
        typeof intentState.slots.district === 'string' && intentState.slots.district.trim()
          ? intentState.slots.district.trim()
          : undefined,
      );
      location = geoResolved ?? undefined;
    }

    if (!location) {
      const reason = !intentState.slots.city && !intentState.slots.location
        ? '意图未抽取 city 或 location 槽位'
        : intentState.slots.city && geoResolved === null
          ? `城市 Geo 解析失败（city="${intentState.slots.city}", district="${intentState.slots.district ?? ''}"）`
          : `slots.location 格式无效（"${intentState.slots.location ?? ''}"）`;
      trace.add('skill-attempt', '本地技能：天气（地点解析）', 'fail', {
        skill: 'weather',
        phase: 'resolve-location',
        slotsCity: intentState.slots.city ?? null,
        slotsDistrict: intentState.slots.district ?? null,
        slotsLocation: intentState.slots.location ?? null,
        geoResolved,
        reason,
        fallback: 'openclaw',
      });
      this.logger.debug(`Weather: ${reason}, fallback to OpenClaw`);
      this.advancePipelineState(pipelineState, 'decision');
      if (!this.featureOpenClaw) {
        trace.add('policy-decision', '策略决策', 'success', {
          decisionRoute: 'chat',
          reason: 'OpenClaw 已关闭，回退聊天',
          pipeline: this.buildPipelineSnapshot(pipelineState),
        });
        return this.buildToolReplyAndSave(
          context,
          conversationId,
          userMsg,
          userInput,
          personaDto,
          null,
          '天气地点解析失败，且 OpenClaw 已关闭，暂无法代为查询',
          intentState,
          {},
          trace,
          pipelineState,
          recent,
        );
      }
      return this.handleOpenClawTask(
        context,
        conversationId,
        userMsg,
        recent,
        userInput,
        intentState,
        personaDto,
        trace,
        pipelineState,
      );
    }

    const displayName = intentState.slots.city
      ? (intentState.slots.district ? `${intentState.slots.city}${intentState.slots.district}` : intentState.slots.city)
      : '该坐标';
    const weatherInput = {
      location,
      dateLabel: typeof intentState.slots.dateLabel === 'string' ? intentState.slots.dateLabel : undefined,
      displayName,
    };

    const result = await this.executeCapabilityGeneric(
      context,
      'weather',
      conversationId,
      userMsg,
      userInput,
      weatherInput,
      intentState,
      personaDto,
      trace,
      pipelineState,
      recent,
      'weather',
    );

    if (!result.result.assistantMessage.content || result.result.assistantMessage.content.includes('失败')) {
      this.advancePipelineState(pipelineState, 'decision');
      trace.add('policy-decision', '策略决策', 'success', {
        decisionRoute: 'run_openclaw',
        reason: '本地 weather 执行失败，回退 OpenClaw',
        pipeline: this.buildPipelineSnapshot(pipelineState),
      });
      this.logger.debug('Weather skill failed, fallback to OpenClaw');
      if (!this.featureOpenClaw) {
        return this.buildToolReplyAndSave(
          context,
          conversationId,
          userMsg,
          userInput,
          personaDto,
          null,
          '本地天气查询失败，且 OpenClaw 已关闭，暂无法代为查询',
          intentState,
          {},
          trace,
          pipelineState,
          recent,
        );
      }
      return this.handleOpenClawTask(
        context,
        conversationId,
        userMsg,
        recent,
        userInput,
        intentState,
        personaDto,
        trace,
        pipelineState,
      );
    }

    return result;
  }

  private async handleBookDownloadCapability(
    context: TurnContext,
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    recent: Array<{ role: string; content: string }>,
    userInput: string,
    intentState: DialogueIntentState,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
  ): Promise<ChatCompletionResult> {
    const bookName = typeof intentState.slots.bookName === 'string' ? intentState.slots.bookName.trim() : '';
    if (!bookName) {
      trace.add('skill-attempt', '本地技能：电子书下载', 'fail', {
        skill: 'book_download',
        reason: '意图未抽取 bookName 槽位',
      });
      if (!this.featureOpenClaw) {
        trace.add('policy-decision', '策略决策', 'success', {
          decisionRoute: 'chat',
          reason: 'OpenClaw 已关闭，回退聊天',
          pipeline: this.buildPipelineSnapshot(pipelineState),
        });
        return this.buildToolReplyAndSave(
          context,
          conversationId,
          userMsg,
          userInput,
          personaDto,
          null,
          '意图未抽取书名，且 OpenClaw 已关闭，暂无法代为下载',
          intentState,
          {},
          trace,
          pipelineState,
          recent,
        );
      }
      return this.handleOpenClawTask(
        context,
        conversationId,
        userMsg,
        recent,
        userInput,
        intentState,
        personaDto,
        trace,
        pipelineState,
      );
    }

    const bookParams = {
      bookName,
      ...(typeof intentState.slots.bookChoiceIndex === 'number'
        && { bookChoiceIndex: intentState.slots.bookChoiceIndex }),
    };

    const result = await trace.wrap('skill-attempt', '本地技能：电子书下载', async () => {
      const execResult = await this.capabilityRegistry.execute('book-download', {
        conversationId,
        turnId: userMsg.id,
        userInput,
        params: bookParams,
        intentState,
      });
      return {
        status: (execResult.success ? 'success' : 'fail') as 'success' | 'fail',
        detail: {
          capability: 'book-download',
          input: bookParams,
          success: execResult.success,
          resultPreview: execResult.content?.slice(0, 200) ?? null,
          error: execResult.error ?? null,
          meta: execResult.meta,
        },
        result: execResult,
      };
    });

    const bookChoices = result.meta?.bookChoices as { title: string; index: number }[] | undefined;
    if (!result.success && bookChoices?.length && result.content) {
      return this.buildToolReplyAndSave(
        context,
        conversationId,
        userMsg,
        userInput,
        personaDto,
        result.content,
        null,
        intentState,
        { localSkillUsed: 'book_download' },
        trace,
        pipelineState,
        recent,
      );
    }

    if (result.success && result.content) {
      return this.buildToolReplyAndSave(
        context,
        conversationId,
        userMsg,
        userInput,
        personaDto,
        result.content,
        null,
        intentState,
        { localSkillUsed: 'book_download' },
        trace,
        pipelineState,
        recent,
      );
    }

    this.advancePipelineState(pipelineState, 'decision');
    trace.add('policy-decision', '策略决策', 'success', {
      decisionRoute: this.featureOpenClaw ? 'run_openclaw' : 'chat',
      reason: this.featureOpenClaw ? '本地 book_download 执行失败，回退 OpenClaw' : 'OpenClaw 已关闭，回退聊天',
      fallbackReason: result.error ?? 'book_download skill returned empty content',
      pipeline: this.buildPipelineSnapshot(pipelineState),
    });
    if (!this.featureOpenClaw) {
      return this.buildToolReplyAndSave(
        context,
        conversationId,
        userMsg,
        userInput,
        personaDto,
        null,
        '本地电子书下载失败，且 OpenClaw 已关闭，暂无法代为下载',
        intentState,
        {},
        trace,
        pipelineState,
        recent,
      );
    }
    return this.handleOpenClawTask(
      context,
      conversationId,
      userMsg,
      recent,
      userInput,
      intentState,
      personaDto,
      trace,
      pipelineState,
    );
  }

  private buildSimpleCapabilityRequest(
    capability: string,
    intentState: DialogueIntentState,
    userInput: string,
  ): {
    capabilityName: string;
    params: Record<string, unknown>;
    localSkillUsed?: 'general_action' | 'timesheet' | 'reminder';
    options?: { fallbackOnReasonCode?: string };
  } | null {
    if (capability === 'general-action') {
      return {
        capabilityName: 'general-action',
        params: { input: userInput },
        localSkillUsed: 'general_action',
        options: { fallbackOnReasonCode: 'NOT_SUPPORTED' },
      };
    }

    if (capability === 'timesheet') {
      return {
        capabilityName: 'timesheet',
        params: this.buildTimesheetParams(intentState.slots, userInput),
        localSkillUsed: 'timesheet',
      };
    }

    if (capability === 'reminder') {
      return {
        capabilityName: 'reminder',
        params: {
          reminderAction: intentState.slots.reminderAction ?? 'create',
          reminderReason: intentState.slots.reminderReason,
          reminderSchedule: intentState.slots.reminderSchedule,
          reminderRunAt: intentState.slots.reminderRunAt,
          reminderTime: intentState.slots.reminderTime,
          reminderWeekday: intentState.slots.reminderWeekday,
          reminderTarget: intentState.slots.reminderTarget,
        },
        localSkillUsed: 'reminder',
      };
    }

    if (capability === 'checkin') {
      return {
        capabilityName: 'checkin',
        params: {},
      };
    }

    return null;
  }

  /** 根据工具执行结果构建小晴转述并保存消息，供 OpenClaw 与本地 Skill 共用 */
  private async buildToolReplyAndSave(
    context: TurnContext,
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    userInput: string,
    personaDto: PersonaDto,
    toolResult: string | null,
    toolError: string | null,
    intentState: DialogueIntentState | null,
    opts: {
      openclawUsed?: boolean;
      localSkillUsed?: 'weather' | 'book_download' | 'general_action' | 'timesheet' | 'reminder';
      messageKind?: ConversationMessageKind;
      messageMetadata?: ConversationMessageMetadata;
    } = {},
    trace?: TraceCollector,
    pipelineState?: PipelineTraceState,
    recentMessages?: { role: string; content: string }[],
  ): Promise<ChatCompletionResult> {
    const path = opts.openclawUsed ? 'tool-openclaw' : opts.localSkillUsed ?? 'tool-local';
    const composition = await (trace
      ? trace.wrap('llm-generate', '生成回复', async () => {
          const result = await this.responseComposer.composeToolReply({
            context,
            userInput,
            recentMessages,
            personaDto,
            intentState,
            toolResult,
            toolError,
            toolKind: opts.openclawUsed ? 'openclaw' : (opts.localSkillUsed ?? 'general_action'),
            profilePrompt: {
              includeImpressionCore: this.featureImpressionCore,
              includeImpressionDetail: true,
            },
            toolWasActuallyUsed: !!opts.openclawUsed || !!opts.localSkillUsed,
          });
          return {
            status: 'success' as const,
            detail: {
              model: this.llm.getModelInfo({ scenario: 'chat' }),
              inputMessages: result.promptMessages.length,
              mode: 'tool-wrap',
            },
            result,
          };
        })
      : this.responseComposer.composeToolReply({
          context,
          userInput,
          recentMessages,
          personaDto,
          intentState,
          toolResult,
          toolError,
          toolKind: opts.openclawUsed ? 'openclaw' : (opts.localSkillUsed ?? 'general_action'),
          profilePrompt: {
            includeImpressionCore: this.featureImpressionCore,
            includeImpressionDetail: true,
          },
          toolWasActuallyUsed: !!opts.openclawUsed || !!opts.localSkillUsed,
        }));
    if (trace && pipelineState) {
      this.recordPipelineStep(trace, pipelineState, 'cognition', {
        path,
        situation: composition.cognitiveState.situation.kind,
        userEmotion: composition.cognitiveState.userState.emotion,
        userNeedMode: composition.cognitiveState.userState.needMode,
        responseStrategy: composition.cognitiveState.responseStrategy,
        rhythm: composition.cognitiveState.rhythm,
        safety: composition.cognitiveState.safety,
      });
      this.recordPipelineStep(trace, pipelineState, 'expression', {
        path,
        phase: 'pre-llm',
        inputMessages: composition.promptMessages.length,
        model: this.llm.getModelInfo({ scenario: 'chat' }),
      });
      this.recordPipelineStep(trace, pipelineState, 'expression', {
        path,
        phase: 'post-llm',
        rawLength: composition.rawReplyContent.length,
        filteredLength: composition.filteredReplyContent.length,
        finalLength: composition.replyContent.length,
        metaAdjusted: composition.rawReplyContent !== composition.filteredReplyContent,
        boundaryAdjusted: composition.boundaryReview.adjusted,
        boundaryReasons: composition.boundaryReview.reasons,
      });
    }
    if (composition.boundaryReview.adjusted) {
      trace?.add('boundary-governance', '边界治理复核', 'success', {
        adjusted: true,
        reasons: composition.boundaryReview.reasons,
        path,
      });
    }

    this.pet.setStateWithAutoIdle('speaking', 3000);

    const assistantMsg = await this.persistAssistantMessage(
      conversationId,
      composition.replyContent,
      {
        kind: opts.messageKind ?? 'tool',
        metadata: {
          source: 'tool',
          toolKind: opts.openclawUsed ? 'openclaw' : (opts.localSkillUsed ?? 'general_action'),
          toolName: opts.openclawUsed ? 'openclaw' : (opts.localSkillUsed ?? 'general_action'),
          success: !toolError,
          summary: this.firstLine(composition.replyContent) ?? undefined,
          ...(opts.messageMetadata ?? {}),
        },
      },
    );
    const postPlan = this.buildPostTurnPlan({
      conversationId,
      userMsg,
      assistantMsg,
      userInput,
      intentState,
      cognitiveState: composition.cognitiveState,
      beforeReturn: [],
      afterReturn: [
        { type: 'life_record_sync' },
        { type: 'record_growth' },
        { type: 'summarize_trigger', trigger: this.resolveSummarizeTrigger(userInput) },
        { type: 'record_cognitive_observation' },
        { type: 'session_reflection' },
      ],
    });

    const debugMeta = this.featureDebugMeta && pipelineState
      ? {
          pipeline: this.buildPipelineSnapshot(pipelineState),
          turnTraceEvents: trace
            ? adaptLegacyTraceToTurnEvents({
                traceId: userMsg.id,
                conversationId,
                turnId: userMsg.id,
                steps: trace.getTrace(),
              })
            : [],
        }
      : undefined;

    return this.wrapResult({
      userMessage: toConversationMessageDto(userMsg),
      assistantMessage: toConversationMessageDto(assistantMsg),
      injectedMemories: [],
      ...(opts.openclawUsed !== undefined && { openclawUsed: opts.openclawUsed }),
      ...(opts.localSkillUsed !== undefined && { localSkillUsed: opts.localSkillUsed }),
      ...(debugMeta && { debugMeta }),
      ...(trace && { trace: trace.getTrace() }),
    }, postPlan);
  }

  // ── 通用 Capability 执行 ─────────────────────────────────────
  private async executeCapabilityGeneric(
    context: TurnContext,
    capabilityName: string,
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    content: string,
    params: Record<string, unknown>,
    intentState: DialogueIntentState,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
    recent: Array<{ role: string; content: string }>,
    localSkillUsed?: 'weather' | 'book_download' | 'general_action' | 'timesheet' | 'reminder',
    options?: {
      /** 条件 fallback：检查 meta.reasonCode，匹配时 fallback 到 OpenClaw */
      fallbackOnReasonCode?: string;
    },
  ): Promise<ChatCompletionResult> {
    const result = await trace.wrap('skill-attempt', `本地技能：${capabilityName}`, async () => {
      const execResult = await this.capabilityRegistry.execute(capabilityName, {
        conversationId,
        turnId: userMsg.id,
        userInput: content,
        params,
        intentState,
      });
      return {
        status: (execResult.success ? 'success' : 'fail') as 'success' | 'fail',
        detail: {
          capability: capabilityName,
          input: params,
          success: execResult.success,
          resultPreview: execResult.content?.slice(0, 200) ?? null,
          error: execResult.error ?? null,
          meta: execResult.meta,
        },
        result: execResult,
      };
    });

    // 条件 fallback 逻辑
    if (options?.fallbackOnReasonCode && !result.success) {
      const reasonCode = typeof result.meta?.reasonCode === 'string' ? result.meta.reasonCode : '';
      if (reasonCode === options.fallbackOnReasonCode) {
        this.advancePipelineState(pipelineState, 'decision');
        trace.add('policy-decision', '策略决策', 'success', {
          decisionRoute: this.featureOpenClaw ? 'run_openclaw' : 'chat',
          reason: this.featureOpenClaw
            ? `本地 ${capabilityName} 返回 ${reasonCode}，回退 OpenClaw`
            : 'OpenClaw 已关闭，回退聊天',
          fallbackReason: result.error ?? `${capabilityName} ${reasonCode}`,
          pipeline: this.buildPipelineSnapshot(pipelineState),
        });
        if (!this.featureOpenClaw) {
          return this.buildToolReplyAndSave(
            context,
            conversationId,
            userMsg,
            content,
            personaDto,
            null,
            '该操作暂不支持，且 OpenClaw 已关闭，暂无法委派',
            intentState,
            {},
            trace,
            pipelineState,
            recent,
          );
        }
        return this.handleOpenClawTask(
          context,
          conversationId,
          userMsg,
          recent,
          content,
          intentState,
          personaDto,
          trace,
          pipelineState,
        );
      }
    }

    const reminderAction = localSkillUsed === 'reminder'
      ? this.readString(result.meta?.reminderAction)
      : undefined;
    const reminderReason = localSkillUsed === 'reminder'
      ? this.readString(result.meta?.reminderReason)
      : undefined;
    const reminderSchedule = localSkillUsed === 'reminder'
      ? this.readString(result.meta?.scheduleText)
      : undefined;
    const reminderId = localSkillUsed === 'reminder'
      ? this.readString(result.meta?.reminderId)
      : undefined;
    const reminderNextRunAt = localSkillUsed === 'reminder'
      ? this.readString(result.meta?.nextRunAt)
      : undefined;
    const reminderCount = localSkillUsed === 'reminder' && typeof result.meta?.count === 'number'
      ? result.meta.count
      : undefined;

    return this.buildToolReplyAndSave(
      context,
      conversationId,
      userMsg,
      content,
      personaDto,
      result.success ? result.content : null,
      result.success ? null : (result.error ?? `${capabilityName} 执行失败`),
      intentState,
      localSkillUsed
        ? {
            localSkillUsed,
            ...(localSkillUsed === 'reminder'
              ? {
                  messageKind: this.resolveReminderMessageKind(reminderAction),
                  messageMetadata: {
                    source: 'tool',
                    reminderAction: (reminderAction as 'create' | 'list' | 'cancel' | undefined),
                    reminderId,
                    reminderReason,
                    scheduleText: reminderSchedule,
                    nextRunAt: reminderNextRunAt,
                    count: reminderCount,
                    summary: result.success
                      ? reminderReason ?? reminderSchedule ?? this.firstLine(result.content)
                      : this.firstLine(result.error) ?? undefined,
                  },
                }
              : {}),
          }
        : {},
      trace,
      pipelineState,
      recent,
    );
  }

  // ── OpenClaw 任务处理 ─────────────────────────────────────
  private async handleOpenClawTask(
    context: TurnContext,
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    recent: Array<{ role: string; content: string }>,
    userInput: string,
    intentState: DialogueIntentState,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
  ): Promise<ChatCompletionResult> {
    if (!this.featureOpenClaw) {
      this.logger.warn('OpenClaw 已关闭，跳过执行');
      return this.buildToolReplyAndSave(
        context,
        conversationId, userMsg, userInput, personaDto,
        null, 'OpenClaw 已禁用',
        intentState, { openclawUsed: false }, trace, pipelineState, recent,
      );
    }
    const taskMessage = this.taskFormatter.formatTask(userInput, intentState, recent);
    this.logger.log(`Delegating to Claw: ${userInput.slice(0, 80)}`);

    const clawResult = await trace.wrap('openclaw', 'OpenClaw 调用', async () => {
      const result = await this.toolRegistry.execute({
        conversationId,
        turnId: userMsg.id,
        userInput,
        executor: 'openclaw',
        capability: 'general_tool',
        intentState,
        recentMessages: recent,
        params: { taskMessage },
      });
      return {
        status: (result.success ? 'success' : 'fail') as 'success' | 'fail',
        detail: {
          taskMessage,
          sessionKey: conversationId,
          success: result.success,
          resultPreview: result.content?.slice(0, 200) ?? null,
          error: result.error ?? null,
        },
        result,
      };
    });

    return this.buildToolReplyAndSave(
      context,
      conversationId, userMsg, userInput, personaDto,
      clawResult.success ? clawResult.content : null,
      clawResult.success ? null : (clawResult.error || null),
      intentState,
      { openclawUsed: true }, trace, pipelineState, recent,
    );
  }

  /** 缺必要参数时由小晴自然追问，不调用 OpenClaw */
  private async handleMissingParamsReply(
    context: TurnContext,
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    userInput: string,
    missingParams: string[],
    intentState: DialogueIntentState | null,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
  ): Promise<ChatCompletionResult> {
    const composition = await trace.wrap('llm-generate', '生成追问回复', async () => {
      const result = await this.responseComposer.composeMissingParamsReply({
        context,
        userInput,
        missingParams,
        personaDto,
        intentState,
        profilePrompt: {
          includeImpressionCore: this.featureImpressionCore,
          includeImpressionDetail: true,
        },
      });
      return {
        status: 'success' as const,
        detail: {
          model: this.llm.getModelInfo({ scenario: 'chat' }),
          inputMessages: result.promptMessages.length,
          mode: 'missing-params-followup',
        },
        result,
      };
    });

    trace.add('missing-params', '缺失参数追问', 'success', {
      missingParams,
      paramLabels: composition.missingParamLabels,
    });
    this.recordPipelineStep(trace, pipelineState, 'cognition', {
      path: 'missing-params',
      situation: composition.cognitiveState.situation.kind,
      userEmotion: composition.cognitiveState.userState.emotion,
      userNeedMode: composition.cognitiveState.userState.needMode,
      responseStrategy: composition.cognitiveState.responseStrategy,
      rhythm: composition.cognitiveState.rhythm,
      safety: composition.cognitiveState.safety,
      missingParams,
    });
    this.recordPipelineStep(trace, pipelineState, 'expression', {
      path: 'missing-params',
      phase: 'pre-llm',
      inputMessages: composition.promptMessages.length,
      model: this.llm.getModelInfo({ scenario: 'chat' }),
    });
    if (composition.boundaryReview.adjusted) {
      trace.add('boundary-governance', '边界治理复核', 'success', {
        adjusted: true,
        reasons: composition.boundaryReview.reasons,
        path: 'missing-params',
      });
    }
    this.recordPipelineStep(trace, pipelineState, 'expression', {
      path: 'missing-params',
      phase: 'post-llm',
      rawLength: composition.rawReplyContent.length,
      filteredLength: composition.filteredReplyContent.length,
      finalLength: composition.replyContent.length,
      metaAdjusted: composition.rawReplyContent !== composition.filteredReplyContent,
      boundaryAdjusted: composition.boundaryReview.adjusted,
      boundaryReasons: composition.boundaryReview.reasons,
    });

    const assistantMsg = await this.persistAssistantMessage(conversationId, composition.replyContent);

    const debugMeta = this.featureDebugMeta
      ? { pipeline: this.buildPipelineSnapshot(pipelineState) }
      : undefined;

    const postPlan = this.buildPostTurnPlan({
      conversationId,
      userMsg,
      assistantMsg,
      userInput,
      intentState,
      cognitiveState: composition.cognitiveState,
      beforeReturn: [],
      afterReturn: [
        { type: 'life_record_sync' },
        { type: 'record_growth' },
        { type: 'record_cognitive_observation' },
        { type: 'session_reflection' },
      ], // no summarize_trigger here
    });

    return this.wrapResult({
      userMessage: toConversationMessageDto(userMsg),
      assistantMessage: toConversationMessageDto(assistantMsg),
      injectedMemories: [],
      ...(debugMeta && { debugMeta }),
      trace: trace.getTrace(),
    }, postPlan);
  }

  // ── 原有聊天路径（提取为独立方法）──────────────────────────
  private async handleChatReply(
    context: TurnContext,
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    recent: Array<{ role: string; content: string }>,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
    intentState?: DialogueIntentState | null,
  ): Promise<ChatCompletionResult> {
    const userProfile = context.user.userProfile;
    const memoryBudget = context.memory.memoryBudgetTokens;
    const finalMemories = context.memory.injectedMemories;
    const needDetail = context.memory.needDetail;
    const candidatesCount = context.memory.candidatesCount;

    // ── 记录命中 + 获取身份锚定 ────────────────────────────
    const hitIds = finalMemories.map((m) => m.id);
    if (hitIds.length > 0) {
      this.memoryDecay.recordHits(hitIds).catch((err) =>
        this.logger.warn(`Failed to record memory hits: ${err}`),
      );
    }
    const composition = await trace.wrap('llm-generate', '生成回复', async () => {
      const result = await this.responseComposer.composeChatReply({
        context,
        recentMessages: recent,
        personaDto,
        intentState,
        maxContextTokens: this.maxContextTokens,
        profilePrompt: {
          includeImpressionCore: this.featureImpressionCore,
          includeImpressionDetail: this.featureImpressionDetail && needDetail,
        },
      });
      return {
        status: 'success' as const,
        detail: {
          model: this.llm.getModelInfo({ scenario: 'chat' }),
          inputMessages: result.promptMessages.length,
          mode: 'chat',
        },
        result,
      };
    });
    const claimCtx = context.claims;

    trace.add('cognitive-pipeline', '认知管道', 'success', {
      phase1: composition.cognitiveState.phasePlan.phase1,
      phase2: composition.cognitiveState.phasePlan.phase2,
      phase3: composition.cognitiveState.phasePlan.phase3,
      situation: composition.cognitiveState.situation.kind,
      userEmotion: composition.cognitiveState.userState.emotion,
      userNeedMode: composition.cognitiveState.userState.needMode,
      responseStrategy: composition.cognitiveState.responseStrategy,
      rhythm: composition.cognitiveState.rhythm,
      safety: composition.cognitiveState.safety,
      growthContext: context.growth.growthContext,
      boundaryPreflight: composition.boundaryPreflight,
    });
    this.recordPipelineStep(trace, pipelineState, 'cognition', {
      path: 'chat',
      phasePlan: composition.cognitiveState.phasePlan,
      situation: composition.cognitiveState.situation,
      userState: composition.cognitiveState.userState,
      responseStrategy: composition.cognitiveState.responseStrategy,
      rhythm: composition.cognitiveState.rhythm,
      safety: composition.cognitiveState.safety,
      boundaryPreflight: composition.boundaryPreflight,
    });
    const actionDecision = composition.actionDecision;
    if (actionDecision) {
      this.logger.debug(`[Decision Context] action=${actionDecision.action}, capability=${actionDecision.capability ?? 'none'}, reason=${actionDecision.reason}`);
    }
    trace.add('prompt-build', 'Prompt 构建', 'success', {
      promptVersion: CHAT_PROMPT_VERSION,
      systemPromptTokens: estimateTokens(composition.promptMessages[0]?.content as string ?? ''),
      historyRounds: this.lastNRounds,
      actualMessagesUsed: recent.length,
      estimatedTotalTokens: composition.estimatedTokens,
      maxContextTokens: this.maxContextTokens,
      truncated: composition.truncated,
      systemPromptPreview: this.previewText(String(composition.promptMessages[0]?.content ?? ''), 480),
      impressionCoreInjected: this.featureImpressionCore && !!userProfile.impressionCore,
      impressionDetailInjected: this.featureImpressionDetail && needDetail && !!userProfile.impressionDetail,
      decisionContextInjected: !!actionDecision,
      actionDecisionSummary: actionDecision ? {
        action: actionDecision.action,
        capability: actionDecision.capability ?? null,
        reason: actionDecision.reason.slice(0, 100),
      } : null,
    });
    this.recordPipelineStep(trace, pipelineState, 'expression', {
      path: 'chat',
      phase: 'pre-llm',
      promptVersion: CHAT_PROMPT_VERSION,
      systemPromptTokens: estimateTokens(composition.promptMessages[0]?.content as string ?? ''),
      inputMessages: composition.promptMessages.length,
      estimatedTotalTokens: composition.estimatedTokens,
      truncated: composition.truncated,
      model: this.llm.getModelInfo({ scenario: 'chat' }),
    });
    if (composition.boundaryReview.adjusted) {
      trace.add('boundary-governance', '边界治理复核', 'success', {
        adjusted: true,
        reasons: composition.boundaryReview.reasons,
      });
    }
    this.recordPipelineStep(trace, pipelineState, 'expression', {
      path: 'chat',
      phase: 'post-llm',
      rawLength: composition.rawReplyContent.length,
      filteredLength: composition.filteredReplyContent.length,
      finalLength: composition.replyContent.length,
      metaAdjusted: composition.rawReplyContent !== composition.filteredReplyContent,
      boundaryAdjusted: composition.boundaryReview.adjusted,
      boundaryReasons: composition.boundaryReview.reasons,
    });

    this.pet.setStateWithAutoIdle('speaking', 3000);

    const assistantMsg = await this.persistAssistantMessage(conversationId, composition.replyContent);

    const postPlan = this.buildPostTurnPlan({
      conversationId,
      userMsg,
      assistantMsg,
      userInput: userMsg.content,
      intentState: intentState ?? null,
      cognitiveState: composition.cognitiveState,
      isImportantIssueInProgress:
        composition.cognitiveState.situation.kind === 'decision_support' ||
        composition.cognitiveState.situation.kind === 'advice_request' ||
        composition.cognitiveState.situation.kind === 'task_execution',
      beforeReturn: [],
      afterReturn: [
        { type: 'life_record_sync' },
        { type: 'record_growth' },
        { type: 'summarize_trigger', trigger: this.resolveSummarizeTrigger(userMsg.content) },
        { type: 'record_cognitive_observation' },
        { type: 'session_reflection' },
      ],
    });

    // ── Debug Meta（保留兼容）─────────────────────────────
    const debugMeta = this.featureDebugMeta ? {
      model: this.llm.getModelInfo({ scenario: 'chat' }),
      context: {
        historyRounds: this.lastNRounds,
        actualMessagesUsed: recent.length,
        estimatedTokens: composition.estimatedTokens,
        maxContextTokens: this.maxContextTokens,
        truncated: composition.truncated,
      },
      memory: {
        featureFlags: {
          keywordPrefilter: this.featureKeywordPrefilter,
          llmRank: this.featureLlmRank,
          dynamicTopK: this.featureDynamicTopK,
          impressionCore: this.featureImpressionCore,
          impressionDetail: this.featureImpressionDetail,
        },
        candidatesCount,
        injectedCount: finalMemories.length,
        memoryBudgetTokens: memoryBudget,
        needDetail,
        claimInjectedCount: claimCtx.claimSignals.length,
        sessionStateInjected: !!claimCtx.sessionState,
        claimsInjected: claimCtx.injectedClaimsDebug.slice(0, 30),
        draftClaimsObserved: claimCtx.draftClaimsDebug.slice(0, 30),
      },
      prompt: {
        version: CHAT_PROMPT_VERSION,
        systemPromptTokens: estimateTokens(composition.promptMessages[0]?.content as string ?? ''),
        systemPromptPreview: this.previewText(String(composition.promptMessages[0]?.content ?? ''), 1400),
        messagePreview: composition.promptMessages.slice(0, 6).map((m) => ({
          role: String(m.role),
          content: this.previewText(String(m.content ?? ''), 240),
        })),
      },
      pipeline: this.buildPipelineSnapshot(pipelineState),
      turnTraceEvents: adaptLegacyTraceToTurnEvents({
        traceId: userMsg.id,
        conversationId,
        turnId: userMsg.id,
        steps: trace.getTrace(),
      }),
    } : undefined;

    return this.wrapResult({
      userMessage: toConversationMessageDto(userMsg),
      assistantMessage: toConversationMessageDto(assistantMsg),
      injectedMemories: finalMemories,
      ...(debugMeta && { debugMeta }),
      trace: trace.getTrace(),
    }, postPlan);
  }

  private buildPostTurnPlan(input: {
    conversationId: string;
    userMsg: { id: string };
    assistantMsg: { id: string; content: string };
    userInput: string;
    intentState?: DialogueIntentState | null;
    cognitiveState?: CognitiveTurnState;
    isImportantIssueInProgress?: boolean;
    beforeReturn: PostTurnPlan['beforeReturn'];
    afterReturn: PostTurnPlan['afterReturn'];
  }): PostTurnPlan {
    return {
      conversationId: input.conversationId,
      turn: {
        turnId: input.userMsg.id,
        userMessageId: input.userMsg.id,
        assistantMessageId: input.assistantMsg.id,
        userInput: input.userInput,
        assistantOutput: input.assistantMsg.content,
        now: new Date(),
      },
      context: {
        intentState: input.intentState ?? null,
        cognitiveState: input.cognitiveState,
        isImportantIssueInProgress: input.isImportantIssueInProgress,
      },
      beforeReturn: input.beforeReturn,
      afterReturn: input.afterReturn,
      opsCollector: { memoryOps: [], claimOps: [], growthOps: [] },
    };
  }

  private resolveSummarizeTrigger(userInput: string): 'instant' | 'threshold' {
    return /(?:记住|记一下|别忘|请你记|帮我记|我叫|我姓|我是(?!说|不是|在说)|我今年|我住在|我在(?!说|想|看)|我换了|我的名字)/
      .test(userInput)
      ? 'instant'
      : 'threshold';
  }

  private async persistAssistantMessage(
    conversationId: string,
    content: string,
    options: PersistedAssistantMessageOptions = {},
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        kind: options.kind ?? 'chat',
        content,
        ...(options.metadata !== undefined
          ? { metadata: options.metadata as Prisma.InputJsonValue }
          : {}),
        tokenCount: estimateTokens(content),
      },
    });
  }

  private resolveReminderMessageKind(action?: string): ConversationMessageKind {
    if (action === 'create') return 'reminder_created';
    if (action === 'list') return 'reminder_list';
    if (action === 'cancel') return 'reminder_cancelled';
    return 'tool';
  }

  private firstLine(text: string | null | undefined): string | undefined {
    const normalized = String(text ?? '').trim();
    if (!normalized) return undefined;
    return normalized.split(/\r?\n/).find((line) => line.trim())?.trim() ?? normalized;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private wrapResult(
    result: SendMessageResult,
    postTurnPlan?: PostTurnPlan,
  ): ChatCompletionResult {
    return postTurnPlan ? { result, postTurnPlan } : { result };
  }

  private createPipelineTraceState(): PipelineTraceState {
    return {
      currentStep: 'idle',
      events: 0,
      seen: new Set<PipelineStepName>(),
      firstSeenOrder: [],
      canonicalOrder: ['cognition', 'decision', 'expression'],
      canonicalMatchSoFar: true,
    };
  }

  private buildPipelineSnapshot(state: PipelineTraceState): {
    currentStep: PipelineStepName | 'idle';
    events: number;
    firstSeenOrder: PipelineStepName[];
    canonicalOrder: PipelineStepName[];
    canonicalMatchSoFar: boolean;
    strictCanonical: boolean;
  } {
    const strictCanonical =
      state.firstSeenOrder.length === state.canonicalOrder.length
      && state.firstSeenOrder.every((step, index) => step === state.canonicalOrder[index]);
    return {
      currentStep: state.currentStep,
      events: state.events,
      firstSeenOrder: [...state.firstSeenOrder],
      canonicalOrder: [...state.canonicalOrder],
      canonicalMatchSoFar: state.canonicalMatchSoFar,
      strictCanonical,
    };
  }

  /** 仅更新 pipeline 状态，不向 trace 添加 step（用于决策合并进 policy-decision 时） */
  private advancePipelineState(state: PipelineTraceState, step: PipelineStepName): void {
    state.events += 1;
    state.currentStep = step;
    if (!state.seen.has(step)) {
      state.seen.add(step);
      state.firstSeenOrder.push(step);
      state.canonicalMatchSoFar = state.firstSeenOrder.every(
        (name, index) => state.canonicalOrder[index] === name,
      );
    }
  }

  /**
   * 仅更新管道状态，不产出独立 trace step。
   * 管道快照由业务 step 在各自 detail 中附带（如 policy-decision、prompt-build、llm-generate）。
   * @see docs/debug-trace-design.md 3.2 policy-decision
   */
  private recordPipelineStep(
    _trace: TraceCollector,
    state: PipelineTraceState,
    step: PipelineStepName,
    _detail: Record<string, unknown>,
    _status: 'success' | 'fail' | 'skip' = 'success',
  ): void {
    state.events += 1;
    state.currentStep = step;
    if (!state.seen.has(step)) {
      state.seen.add(step);
      state.firstSeenOrder.push(step);
      state.canonicalMatchSoFar = state.firstSeenOrder.every(
        (name, index) => state.canonicalOrder[index] === name,
      );
    }
  }

  private previewText(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}…`;
  }

}
