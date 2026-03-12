import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { LlmService } from '../../infra/llm/llm.service';
import { CHAT_PROMPT_VERSION, PromptRouterService } from '../prompt-router/prompt-router.service';
import { MemoryService, MemoryCandidate } from '../memory/memory.service';
import { MemoryDecayService } from '../memory/memory-decay.service';
import { PersonaService, PersonaDto } from '../persona/persona.service';
import { UserProfileService, type UserProfileDto } from '../persona/user-profile.service';
import { IntentService } from '../intent/intent.service';
import type { DialogueIntentState } from '../intent/intent.types';
import { TaskFormatterService } from '../../openclaw/task-formatter.service';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import { WeatherSkillService } from '../../action/skills/weather/weather-skill.service';
import { WorldStateService } from '../../infra/world-state/world-state.service';
import { IdentityAnchorService } from '../identity-anchor/identity-anchor.service';
import { PetService } from '../pet/pet.service';
import { SummarizerService } from '../summarizer/summarizer.service';
import { EvolutionSchedulerService } from '../persona/evolution-scheduler.service';
import { CognitivePipelineService } from '../cognitive-pipeline/cognitive-pipeline.service';
import { CognitiveGrowthService } from '../cognitive-pipeline/cognitive-growth.service';
import { BoundaryGovernanceService } from '../cognitive-pipeline/boundary-governance.service';
import type {
  BoundaryPromptContext,
  ClaimSignal,
  CognitiveTurnState,
  SessionStateSignal,
} from '../cognitive-pipeline/cognitive-pipeline.types';
import { MetaLayerService } from '../meta-layer/meta-layer.service';
import { ClaimEngineConfig } from '../claim-engine/claim-engine.config';
import { ClaimSelectorService } from '../claim-engine/claim-selector.service';
import { SessionStateService } from '../claim-engine/session-state.service';
import { truncateToTokenBudget, estimateMessagesTokens, estimateTokens } from '../../infra/token-estimator';
import { TraceCollector } from '../../infra/trace/trace-collector';
import type { TraceStep } from '../../infra/trace/trace.types';
import { adaptLegacyTraceToTurnEvents } from '../../infra/trace/turn-trace.adapter';
import { DailyMomentService } from '../daily-moment/daily-moment.service';
import type { DailyMomentChatMessage, DailyMomentRecord, DailyMomentSuggestion } from '../daily-moment/daily-moment.types';
import type {
  SendMessageResult,
  ToolPolicyAction,
  ToolPolicyDecision,
  TurnContext,
} from './orchestration.types';
import { ToolExecutorRegistry } from '../../action/tools/tool-executor-registry.service';
import { PostTurnPipeline } from '../post-turn/post-turn.pipeline';
import type { PostTurnPlan, PostTurnTask } from '../post-turn/post-turn.types';
import { SkillRunner } from '../../action/local-skills/skill-runner.service';
import type { LocalSkillRunResult } from '../../action/local-skills/local-skill.types';
import { FeatureFlagConfig } from './feature-flag.config';

type PipelineStepName = 'cognition' | 'decision' | 'expression';

interface PipelineTraceState {
  currentStep: PipelineStepName | 'idle';
  events: number;
  seen: Set<PipelineStepName>;
  firstSeenOrder: PipelineStepName[];
  canonicalOrder: PipelineStepName[];
  canonicalMatchSoFar: boolean;
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
  /** 自动触发总结（默认 on，每 N 条用户消息后异步执行） */
  private readonly featureAutoSummarize: boolean;
  /** 自动总结触发阈值：summarizedAt 之后累计 N 条用户消息（默认 15） */
  private readonly autoSummarizeThreshold: number;
  /** OpenClaw 意图置信度阈值 */
  private readonly openclawConfidenceThreshold: number;
  /** 即时触发总结：关键词命中时立即总结（默认 on） */
  private readonly featureInstantSummarize: boolean;

  /** 即时触发正则：显式记忆指令 + 身份/事实声明 */
  private static readonly INSTANT_SUMMARIZE_RE =
    /(?:记住|记一下|别忘|请你记|帮我记|我叫|我姓|我是(?!说|不是|在说)|我今年|我住在|我在(?!说|想|看)|我换了|我的名字)/;
  private static readonly SKILL_COMMAND_RE = /^\/skill\s+([a-z0-9-]+)\s*$/;

  /** 防止同一会话并发总结 */
  private summarizingConversations = new Set<string>();

  private readonly logger = new Logger(ChatCompletionEngine.name);
  private preparedContext: TurnContext | null = null;
  private forcedPolicy: ToolPolicyDecision | null = null;

  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
    private router: PromptRouterService,
    private memory: MemoryService,
    private memoryDecay: MemoryDecayService,
    private persona: PersonaService,
    private userProfile: UserProfileService,
    private intent: IntentService,
    private taskFormatter: TaskFormatterService,
    private capabilityRegistry: CapabilityRegistry,
    private weatherSkill: WeatherSkillService,
    private worldState: WorldStateService,
    private identityAnchor: IdentityAnchorService,
    private pet: PetService,
    private summarizer: SummarizerService,
    private evolutionScheduler: EvolutionSchedulerService,
    private cognitivePipeline: CognitivePipelineService,
    private cognitiveGrowth: CognitiveGrowthService,
    private boundaryGovernance: BoundaryGovernanceService,
    private metaLayer: MetaLayerService,
    private claimConfig: ClaimEngineConfig,
    private claimSelector: ClaimSelectorService,
    private sessionStateStore: SessionStateService,
    private dailyMoment: DailyMomentService,
    private toolRegistry: ToolExecutorRegistry,
    private localSkillRunner: SkillRunner,
    private postTurnPipeline: PostTurnPipeline,
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
    this.featureAutoSummarize = flags.featureAutoSummarize;
    this.autoSummarizeThreshold = flags.autoSummarizeThreshold;
    this.openclawConfidenceThreshold = flags.openclawConfidenceThreshold;
    this.featureInstantSummarize = flags.featureInstantSummarize;
  }

  private async getLastNDailyMomentMessages(
    conversationId: string,
    take = 18,
  ): Promise<DailyMomentChatMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows
      .reverse()
      .filter((m): m is typeof m & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }));
  }

  async execute(
    context: TurnContext,
    policy: ToolPolicyDecision,
  ): Promise<SendMessageResult> {
    this.preparedContext = context;
    this.forcedPolicy = policy;
    try {
      return this.processTurnInternal(context);
    } finally {
      this.preparedContext = null;
      this.forcedPolicy = null;
    }
  }

  private async processTurnInternal(context: TurnContext): Promise<SendMessageResult> {
    const { conversationId, userInput: content, userMessage: userMsg } = context.request;
    const trace = new TraceCollector(this.featureDebugMeta);
    const pipelineState = this.createPipelineTraceState();

    this.pet.setState('thinking');

    const recent = context.conversation.recentMessages;
    const personaDto = context.persona.personaDto;
    const anchorCity = context.user.anchorCity;
    const defaultLocationContext = context.world.defaultWorldState;
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

    this.dailyMoment
      .ingestUserSignal(conversationId, content, now)
      .catch((err) => this.logger.warn(`DailyMoment signal ingest failed: ${String(err)}`));

    const dailyMomentIntent = await this.dailyMoment.detectUserTriggerIntent(
      conversationId,
      content,
      now,
    );
    if (dailyMomentIntent.shouldGenerate && dailyMomentIntent.mode) {
      this.advancePipelineState(pipelineState, 'decision');

      const recentForMoment = await this.getLastNDailyMomentMessages(conversationId);
      const generated = await this.dailyMoment.generateMomentEntry({
        conversationId,
        recentMessages: recentForMoment,
        now,
        triggerMode: dailyMomentIntent.mode,
        acceptedSuggestionId: dailyMomentIntent.acceptedSuggestionId,
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
          content: generated.renderedText,
          tokenCount: estimateTokens(generated.renderedText),
        },
      });

      this.pet.setStateWithAutoIdle('speaking', 2000);

      return {
        userMessage: {
          id: userMsg.id,
          role: userMsg.role,
          content: userMsg.content,
          createdAt: userMsg.createdAt,
        },
        assistantMessage: {
          id: assistantMsg.id,
          role: assistantMsg.role,
          content: assistantMsg.content,
          createdAt: assistantMsg.createdAt,
        },
        injectedMemories: [],
        dailyMoment: {
          mode: 'entry',
          record: generated.record,
        },
        ...(trace && { trace: trace.getTrace() }),
      };
    }

    // Claw 为被动工具层，仅工具型请求才调用；闲聊/思考/情绪不经过 Claw。
    // ── 意图识别 + OpenClaw 分流 ──────────────────────────
    let intentState: DialogueIntentState | null =
      this.preparedContext?.runtime.mergedIntentState
      ?? this.preparedContext?.runtime.intentState
      ?? null;
    const hasAnyChatCapability = this.featureOpenClaw || this.capabilityRegistry.listAvailable('chat').length > 0;
    if (!intentState && hasAnyChatCapability) {
      try {
        intentState = await trace.wrap('intent', '意图识别', async () => {
          const capabilityPrompt = this.capabilityRegistry.buildCapabilityPrompt('chat');
          const state = await this.intent.recognize(recent, content, defaultLocationContext, capabilityPrompt || undefined);
          return {
            status: 'success' as const,
            detail: {
              userInput: content,
              defaultWorldState: defaultLocationContext,
              anchorCityFallback: anchorCity ?? null,
              intentNormalized: {
                mode: state.mode,
                requiresTool: state.requiresTool,
                taskIntent: state.taskIntent,
                confidence: state.confidence,
                suggestedTool: state.suggestedTool ?? null,
                slots: state.slots,
                missingParams: state.missingParams,
                seriousness: state.seriousness,
                expectation: state.expectation,
                agency: state.agency,
              },
            },
            result: state,
          };
        });
      } catch (err) {
        trace.add('intent', '意图识别', 'fail', {
          userInput: content,
          error: String(err),
          decision: 'chat',
          reason: '意图识别异常，降级为聊天路径',
        });
        this.advancePipelineState(pipelineState, 'decision');
        this.logger.warn(`Intent recognition failed, falling back to chat: ${err}`);
      }

    }

    if (intentState) {
      let merged = intentState;
      if (this.preparedContext?.runtime.mergedIntentState) {
        merged = this.preparedContext.runtime.mergedIntentState;
      } else {
        // 用户明确声明变化时更新 World State（覆盖旧值）
        if (intentState.worldStateUpdate && Object.keys(intentState.worldStateUpdate).length > 0) {
          await this.worldState.update(conversationId, intentState.worldStateUpdate);
          trace.add('world-state', '世界状态更新', 'success', {
            updated: Object.keys(intentState.worldStateUpdate),
          });
        }

        // 长期身份声明写回 IdentityAnchor（如"我住北京"→ location）
        if (intentState.identityUpdate && Object.keys(intentState.identityUpdate).length > 0) {
          await this.writeIdentityUpdate(intentState.identityUpdate, trace);
        }

        // 用 World State 补全槽位；仅当补全后仍缺失时才允许反问用户
        const mergedResult = await this.worldState.mergeSlots(
          conversationId,
          intentState,
          anchorCity ? { city: anchorCity } : null,
        );
        merged = mergedResult.merged;
        const { filledFromWorldState } = mergedResult;
        if (filledFromWorldState.length > 0) {
          trace.add('world-state', '槽位补全', 'success', {
            filledFromWorldState,
            mergedMissingParams: merged.missingParams,
          });
        }
        this.logger.debug(
          `Intent: requiresTool=${merged.requiresTool}, taskIntent=${merged.taskIntent}, ` +
          `missingParams=${merged.missingParams.length}, filledFromWorldState=${filledFromWorldState.join(',') || 'none'}`,
        );

      }

      const policy = this.forcedPolicy ?? this.decideToolPolicy(merged);
        this.advancePipelineState(pipelineState, 'decision');
        trace.add('policy-decision', '策略决策', 'success', {
          policyDecision: policy.action,
          reason: policy.reason,
          confidence: merged.confidence,
          threshold: this.openclawConfidenceThreshold,
          taskIntent: merged.taskIntent,
          requiresTool: merged.requiresTool,
          missingParams: merged.missingParams,
          pipeline: this.buildPipelineSnapshot(pipelineState),
        });
      if (policy.action === 'ask_missing') {
          return this.handleMissingParamsReply(
            conversationId, userMsg, content, merged.missingParams, merged, personaDto, trace, pipelineState,
          );
        }
      if (policy.action === 'run_local_weather') {
          let location = this.takeValidCoord(merged.slots.location);
          let geoResolved: string | null = null;
          if (!location && merged.slots.city) {
            geoResolved = await this.weatherSkill.resolveCityToLocation(
              merged.slots.city,
              typeof merged.slots.district === 'string' && merged.slots.district.trim()
                ? merged.slots.district.trim()
                : undefined,
            );
            location = geoResolved ?? undefined;
          }
          if (!location) {
            const reason = !merged.slots.city && !merged.slots.location
              ? '意图未抽取 city 或 location 槽位'
              : merged.slots.city && geoResolved === null
                ? `城市 Geo 解析失败（city="${merged.slots.city}", district="${merged.slots.district ?? ''}"）`
                : `slots.location 格式无效（"${merged.slots.location ?? ''}"）`;
            trace.add('skill-attempt', '本地技能：天气（地点解析）', 'fail', {
              skill: 'weather',
              phase: 'resolve-location',
              slotsCity: merged.slots.city ?? null,
              slotsDistrict: merged.slots.district ?? null,
              slotsLocation: merged.slots.location ?? null,
              geoResolved,
              reason,
              fallback: 'openclaw',
            });
            this.logger.debug(`Weather: ${reason}, fallback to OpenClaw`);
            this.advancePipelineState(pipelineState, 'decision');
            if (!this.featureOpenClaw) {
              trace.add('policy-decision', '策略决策', 'success', {
                policyDecision: 'chat',
                reason: 'OpenClaw 已关闭，回退聊天',
                pipeline: this.buildPipelineSnapshot(pipelineState),
              });
              return this.buildToolReplyAndSave(
                conversationId, userMsg, content, personaDto,
                null, '天气地点解析失败，且 OpenClaw 已关闭，暂无法代为查询',
                merged, {}, trace, pipelineState, recent,
              );
            }
            return this.handleOpenClawTask(
              conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState,
            );
          }
          const displayName = merged.slots.city
            ? (merged.slots.district ? `${merged.slots.city}${merged.slots.district}` : merged.slots.city)
            : '该坐标';
          const weatherInput = {
            location,
            dateLabel: typeof merged.slots.dateLabel === 'string' ? merged.slots.dateLabel : undefined,
            displayName,
          };
          const weatherResult = await trace.wrap('skill-attempt', '本地技能：天气', async () => {
            const result = await this.toolRegistry.execute({
              conversationId,
              turnId: userMsg.id,
              userInput: content,
              executor: 'local-weather',
              capability: 'weather_query',
              intentState: merged,
              params: weatherInput as Record<string, unknown>,
            });
            return {
              status: (result.success ? 'success' : 'fail') as 'success' | 'fail',
              detail: {
                skill: 'weather',
                input: weatherInput,
                success: result.success,
                resultPreview: result.content?.slice(0, 200) ?? null,
                error: result.error ?? null,
                fallback: result.success ? null : 'openclaw',
              },
              result,
            };
          });
          if (weatherResult.success && weatherResult.content) {
            return this.buildToolReplyAndSave(
              conversationId, userMsg, content, personaDto,
              weatherResult.content, null,
              merged,
              { localSkillUsed: 'weather' }, trace, pipelineState, recent,
            );
          }
          this.advancePipelineState(pipelineState, 'decision');
          trace.add('policy-decision', '策略决策', 'success', {
            policyDecision: 'run_openclaw',
            reason: '本地 weather 执行失败，回退 OpenClaw',
            fallbackReason: weatherResult.error ?? 'weather skill returned empty content',
            pipeline: this.buildPipelineSnapshot(pipelineState),
          });
          this.logger.debug(`Weather skill failed or unavailable, fallback to OpenClaw: ${weatherResult.error ?? 'no content'}`);
          if (!this.featureOpenClaw) {
            return this.buildToolReplyAndSave(
              conversationId, userMsg, content, personaDto,
              null, '本地天气查询失败，且 OpenClaw 已关闭，暂无法代为查询',
              merged, {}, trace, pipelineState, recent,
            );
          }
          return this.handleOpenClawTask(
            conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState,
          );
        }
      if (policy.action === 'run_local_book_download') {
          const bookName = typeof merged.slots.bookName === 'string' ? merged.slots.bookName.trim() : '';
          if (!bookName) {
            trace.add('skill-attempt', '本地技能：电子书下载', 'fail', {
              skill: 'book_download',
              reason: '意图未抽取 bookName 槽位',
            });
            if (!this.featureOpenClaw) {
              trace.add('policy-decision', '策略决策', 'success', {
                policyDecision: 'chat',
                reason: 'OpenClaw 已关闭，回退聊天',
                pipeline: this.buildPipelineSnapshot(pipelineState),
              });
              return this.buildToolReplyAndSave(
                conversationId, userMsg, content, personaDto,
                null, '意图未抽取书名，且 OpenClaw 已关闭，暂无法代为下载',
                merged, {}, trace, pipelineState, recent,
              );
            }
            return this.handleOpenClawTask(
              conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState,
            );
          }
          const bookResult = await trace.wrap('skill-attempt', '本地技能：电子书下载', async () => {
            const result = await this.toolRegistry.execute({
              conversationId,
              turnId: userMsg.id,
              userInput: content,
              executor: 'local-book-download',
              capability: 'book_download',
              intentState: merged,
              params: {
                bookName,
                ...(typeof merged.slots.bookChoiceIndex === 'number' && { bookChoiceIndex: merged.slots.bookChoiceIndex }),
              },
            });
            return {
              status: (result.success ? 'success' : 'fail') as 'success' | 'fail',
              detail: {
                skill: 'book_download',
                input: { bookName },
                success: result.success,
                resultPreview: result.content?.slice(0, 200) ?? null,
                error: result.error ?? null,
                ...(result.meta?.bookDownloadDebug != null && { bookDownloadDebug: result.meta.bookDownloadDebug as { listItemCount: number; searchResultCount: number; filteredCount: number } }),
              },
              result,
            };
          });
          // 多条匹配：将候选列表作为工具结果展示给用户
          const bookChoices = bookResult.meta?.bookChoices as { title: string; index: number }[] | undefined;
          if (!bookResult.success && bookChoices?.length && bookResult.content) {
            return this.buildToolReplyAndSave(
              conversationId, userMsg, content, personaDto,
              bookResult.content, null,
              merged,
              { localSkillUsed: 'book_download' }, trace, pipelineState, recent,
            );
          }
          if (bookResult.success && bookResult.content) {
            return this.buildToolReplyAndSave(
              conversationId, userMsg, content, personaDto,
              bookResult.content, null,
              merged,
              { localSkillUsed: 'book_download' }, trace, pipelineState, recent,
            );
          }
          this.advancePipelineState(pipelineState, 'decision');
          trace.add('policy-decision', '策略决策', 'success', {
            policyDecision: this.featureOpenClaw ? 'run_openclaw' : 'chat',
            reason: this.featureOpenClaw ? '本地 book_download 执行失败，回退 OpenClaw' : 'OpenClaw 已关闭，回退聊天',
            fallbackReason: bookResult.error ?? 'book_download skill returned empty content',
            pipeline: this.buildPipelineSnapshot(pipelineState),
          });
          if (!this.featureOpenClaw) {
            return this.buildToolReplyAndSave(
              conversationId, userMsg, content, personaDto,
              null, '本地电子书下载失败，且 OpenClaw 已关闭，暂无法代为下载',
              merged, {}, trace, pipelineState, recent,
            );
          }
          return this.handleOpenClawTask(
            conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState,
          );
        }
      if (policy.action === 'run_local_general_action') {
          const actionResult = await trace.wrap('skill-attempt', '本地技能：基础行动能力', async () => {
            const result = await this.toolRegistry.execute({
              conversationId,
              turnId: userMsg.id,
              userInput: content,
              executor: 'local-general-action',
              capability: 'general_tool',
              intentState: merged,
              params: { input: content },
            });
            return {
              status: (result.success ? 'success' : 'fail') as 'success' | 'fail',
              detail: {
                skill: 'general_action',
                input: { userInput: content },
                success: result.success,
                resultPreview: result.content?.slice(0, 200) ?? null,
                error: result.error ?? null,
                reasonCode: typeof result.meta?.reasonCode === 'string' ? result.meta.reasonCode : null,
                actionType: typeof result.meta?.actionType === 'string' ? result.meta.actionType : null,
              },
              result,
            };
          });

          const reasonCode = typeof actionResult.meta?.reasonCode === 'string'
            ? actionResult.meta.reasonCode
            : '';

          // 约束：仅 NOT_SUPPORTED 自动回退 OpenClaw；其余错误不自动回退。
          if (!actionResult.success && reasonCode === 'NOT_SUPPORTED') {
            this.advancePipelineState(pipelineState, 'decision');
            trace.add('policy-decision', '策略决策', 'success', {
              policyDecision: this.featureOpenClaw ? 'run_openclaw' : 'chat',
              reason: this.featureOpenClaw ? '本地 general_action 返回 NOT_SUPPORTED，回退 OpenClaw' : 'OpenClaw 已关闭，回退聊天',
              fallbackReason: actionResult.error ?? 'general_action not supported',
              pipeline: this.buildPipelineSnapshot(pipelineState),
            });
            if (!this.featureOpenClaw) {
              return this.buildToolReplyAndSave(
                conversationId, userMsg, content, personaDto,
                null, '该操作暂不支持，且 OpenClaw 已关闭，暂无法委派',
                merged, {}, trace, pipelineState, recent,
              );
            }
            return this.handleOpenClawTask(
              conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState,
            );
          }

          return this.buildToolReplyAndSave(
            conversationId,
            userMsg,
            content,
            personaDto,
            actionResult.success ? actionResult.content : null,
            actionResult.success ? null : (actionResult.error ?? '本地动作执行失败'),
            merged,
            { localSkillUsed: 'general_action' },
            trace,
            pipelineState,
            recent,
          );
        }
      if (policy.action === 'run_local_timesheet') {
          const timesheetParams = this.buildTimesheetParams(merged.slots, content);
          const tsResult = await trace.wrap('skill-attempt', '本地技能：工时上报', async () => {
            const result = await this.toolRegistry.execute({
              conversationId,
              turnId: userMsg.id,
              userInput: content,
              executor: 'local-timesheet',
              capability: 'timesheet',
              intentState: merged,
              params: timesheetParams,
            });
            return {
              status: (result.success ? 'success' : 'fail') as 'success' | 'fail',
              detail: {
                skill: 'timesheet',
                input: timesheetParams,
                success: result.success,
                resultPreview: result.content?.slice(0, 200) ?? null,
                error: result.error ?? null,
              },
              result,
            };
          });

          return this.buildToolReplyAndSave(
            conversationId,
            userMsg,
            content,
            personaDto,
            tsResult.success ? tsResult.content : null,
            tsResult.success ? null : (tsResult.error ?? '工时上报失败'),
            merged,
            { localSkillUsed: 'timesheet' },
            trace,
            pipelineState,
            recent,
          );
        }
      if (policy.action === 'run_openclaw') {
          if (!this.featureOpenClaw) {
            this.logger.debug('OpenClaw 已关闭，工具意图回退聊天');
            return this.buildToolReplyAndSave(
              conversationId, userMsg, content, personaDto,
              null, 'OpenClaw 已关闭，暂无法执行该任务',
              merged, {}, trace, pipelineState, recent,
            );
          }
          return this.handleOpenClawTask(
            conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState,
          );
        }
    } else {
      trace.add('intent', '意图识别', 'skip', {
        reason: 'OpenClaw 未开启且无可用本地能力，跳过意图识别',
      });
      this.advancePipelineState(pipelineState, 'decision');
    }

    if (!pipelineState.seen.has('decision')) {
      this.advancePipelineState(pipelineState, 'decision');
    }

    // ── 原有聊天路径 ──────────────────────────────────────
    return this.handleChatReply(conversationId, userMsg, recent, personaDto, trace, pipelineState, intentState);
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
  ): Promise<SendMessageResult> {
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

    const assistantMsg = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: localSkillRun.summary,
        tokenCount: estimateTokens(localSkillRun.summary),
      },
    });

    return {
      userMessage: {
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
        createdAt: userMsg.createdAt,
      },
      assistantMessage: {
        id: assistantMsg.id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        createdAt: assistantMsg.createdAt,
      },
      injectedMemories: [],
      meta: {
        localSkillRun,
      },
      ...(trace && { trace: trace.getTrace() }),
    };
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

  /** capability name → ToolPolicyAction 映射（保持下游兼容） */
  private static readonly CAPABILITY_TO_ACTION: Record<string, ToolPolicyAction> = {
    'weather': 'run_local_weather',
    'book-download': 'run_local_book_download',
    'general-action': 'run_local_general_action',
    'timesheet': 'run_local_timesheet',
  };

  private decideToolPolicy(intentState: DialogueIntentState): ToolPolicyDecision {
    if (!intentState.requiresTool) {
      return { action: 'chat', reason: '意图为非工具请求，走聊天路径' };
    }
    if (intentState.confidence < this.openclawConfidenceThreshold) {
      return {
        action: 'chat',
        reason: `工具意图置信度 ${intentState.confidence} < 阈值 ${this.openclawConfidenceThreshold}`,
      };
    }
    const allowTimesheetDefaultParams = intentState.taskIntent === 'timesheet' &&
      intentState.missingParams.every((name) => name === 'timesheetDate' || name === 'timesheetMonth');
    if (intentState.missingParams.length > 0 && !allowTimesheetDefaultParams) {
      return {
        action: 'ask_missing',
        reason: `需要工具但缺少参数：${intentState.missingParams.join('、')}`,
      };
    }

    // 统一通过 CapabilityRegistry 查找本地能力
    if (intentState.taskIntent !== 'none' && intentState.taskIntent !== 'dev_task') {
      const cap = this.capabilityRegistry.findByTaskIntent(intentState.taskIntent, 'chat');
      if (cap) {
        const action = ChatCompletionEngine.CAPABILITY_TO_ACTION[cap.name];
        if (action) {
          return { action, reason: `${intentState.taskIntent} 意图参数齐全，本地 ${cap.name} 可用` };
        }
      }
      // 本地能力不可用，尝试 OpenClaw fallback
      if (this.featureOpenClaw) {
        return { action: 'run_openclaw', reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置，回退 OpenClaw` };
      }
      return {
        action: 'chat',
        reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置且 OpenClaw 已关闭，回退聊天`,
      };
    }

    // taskIntent = none 但 requiresTool = true 的兜底
    if (this.featureOpenClaw) {
      return { action: 'run_openclaw', reason: '工具意图参数齐全，委派 OpenClaw 执行' };
    }
    return {
      action: 'chat',
      reason: '工具意图参数齐全，但未开启 OpenClaw，改用普通聊天',
    };
  }

  /** 根据工具执行结果构建小晴转述并保存消息，供 OpenClaw 与本地 Skill 共用 */
  private async buildToolReplyAndSave(
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    userInput: string,
    personaDto: PersonaDto,
    toolResult: string | null,
    toolError: string | null,
    intentState: DialogueIntentState | null,
    opts: { openclawUsed?: boolean; localSkillUsed?: 'weather' | 'book_download' | 'general_action' | 'timesheet' } = {},
    trace?: TraceCollector,
    pipelineState?: PipelineTraceState,
    recentMessages?: { role: string; content: string }[],
  ) {
    const preparedContext = this.preparedContext;
    const worldState = preparedContext?.world.fullWorldState ?? await this.worldState.get(conversationId);
    const growthContext = preparedContext?.growth.growthContext ?? await this.cognitiveGrowth.getGrowthContext();
    const claimCtx = preparedContext?.claims ?? await this.buildClaimAndSessionContext(conversationId);
    const userProfileText = this.buildInjectedUserProfileText(
      preparedContext?.user.userProfile ?? await this.userProfile.getOrCreate(),
      { includeImpressionCore: this.featureImpressionCore, includeImpressionDetail: true },
    );
    const expressionText = this.router.buildExpressionPolicy(
      this.persona.getExpressionFields(personaDto),
      intentState ?? undefined,
    );
    const toolCognitiveState = this.cognitivePipeline.analyzeTurn({
      userInput,
      recentMessages: recentMessages ?? [],
      intentState,
      worldState,
      growthContext,
      claimSignals: claimCtx.claimSignals,
      sessionState: claimCtx.sessionState,
    });
    if (trace && pipelineState) {
      this.recordPipelineStep(trace, pipelineState, 'cognition', {
        path: opts.openclawUsed ? 'tool-openclaw' : opts.localSkillUsed ?? 'tool-local',
        situation: toolCognitiveState.situation.kind,
        userEmotion: toolCognitiveState.userState.emotion,
        userNeedMode: toolCognitiveState.userState.needMode,
        responseStrategy: toolCognitiveState.responseStrategy,
        rhythm: toolCognitiveState.rhythm,
        safety: toolCognitiveState.safety,
      });
    }

    const wrapMessages = this.router.buildToolResultMessages({
      personaText: this.persona.buildPersonaPrompt(personaDto),
      expressionText,
      userProfileText,
      metaFilterPolicy: personaDto.metaFilterPolicy,
      toolKind: opts.openclawUsed ? 'openclaw' : opts.localSkillUsed,
      userInput,
      toolResult,
      toolError,
      recentMessages,
    });
    if (trace && pipelineState) {
      this.recordPipelineStep(trace, pipelineState, 'expression', {
        path: opts.openclawUsed ? 'tool-openclaw' : opts.localSkillUsed ?? 'tool-local',
        phase: 'pre-llm',
        inputMessages: wrapMessages.length,
        model: this.llm.getModelInfo({ scenario: 'chat' }),
      });
    }

    const rawReplyContent = await (trace
      ? trace.wrap('llm-generate', '生成回复', async () => {
          const content = await this.llm.generate(wrapMessages, { scenario: 'chat' });
          return {
            status: 'success' as const,
            detail: {
              model: this.llm.getModelInfo({ scenario: 'chat' }),
              inputMessages: wrapMessages.length,
              mode: 'tool-wrap',
            },
            result: content,
          };
        })
      : this.llm.generate(wrapMessages, { scenario: 'chat' }));
    const filteredReplyContent = this.applyMetaLayerFilter(
      rawReplyContent,
      personaDto.metaFilterPolicy,
      trace,
      opts.openclawUsed ? 'openclaw' : opts.localSkillUsed ?? 'tool',
    );
    const review = this.boundaryGovernance.reviewGeneratedReply(filteredReplyContent, toolCognitiveState, {
      toolWasActuallyUsed: !!opts.openclawUsed || !!opts.localSkillUsed,
    });
    if (review.adjusted) {
      trace?.add('boundary-governance', '边界治理复核', 'success', {
        adjusted: true,
        reasons: review.reasons,
        path: opts.openclawUsed ? 'openclaw' : opts.localSkillUsed ?? 'tool',
      });
    }
    const replyContent = review.content;
    if (trace && pipelineState) {
      this.recordPipelineStep(trace, pipelineState, 'expression', {
        path: opts.openclawUsed ? 'tool-openclaw' : opts.localSkillUsed ?? 'tool-local',
        phase: 'post-llm',
        rawLength: rawReplyContent.length,
        filteredLength: filteredReplyContent.length,
        finalLength: replyContent.length,
        metaAdjusted: rawReplyContent !== filteredReplyContent,
        boundaryAdjusted: review.adjusted,
        boundaryReasons: review.reasons,
      });
    }

    this.pet.setStateWithAutoIdle('speaking', 3000);

    const assistantMsg = await this.prisma.message.create({
      data: { conversationId, role: 'assistant', content: replyContent, tokenCount: estimateTokens(replyContent) },
    });
    const summarizeTrigger: 'instant' | 'threshold' = this.shouldInstantSummarize(userInput)
      ? 'instant'
      : 'threshold';
    const postPlan: PostTurnPlan = {
      conversationId,
      turn: {
        turnId: userMsg.id,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        userInput,
        assistantOutput: assistantMsg.content,
        now: new Date(),
      },
      context: {
        intentState,
        cognitiveState: toolCognitiveState,
      },
      beforeReturn: [],
      afterReturn: [{ type: 'record_growth' }, { type: 'summarize_trigger', trigger: summarizeTrigger }],
    };
    this.postTurnPipeline.runAfterReturn(
      postPlan,
      async (task) => this.runPostTurnTask(task, postPlan, { trace, userMsgId: userMsg.id, assistantMsgId: assistantMsg.id }),
    ).catch((err) => this.logger.warn(`Post-turn pipeline (tool path) failed: ${String(err)}`));

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

    return {
      userMessage: {
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
        createdAt: userMsg.createdAt,
      },
      assistantMessage: {
        id: assistantMsg.id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        createdAt: assistantMsg.createdAt,
      },
      injectedMemories: [],
      ...(opts.openclawUsed !== undefined && { openclawUsed: opts.openclawUsed }),
      ...(opts.localSkillUsed !== undefined && { localSkillUsed: opts.localSkillUsed }),
      ...(debugMeta && { debugMeta }),
      ...(trace && { trace: trace.getTrace() }),
    };
  }

  // ── OpenClaw 任务处理 ─────────────────────────────────────
  private async handleOpenClawTask(
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    recent: Array<{ role: string; content: string }>,
    userInput: string,
    intentState: DialogueIntentState,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
  ) {
    if (!this.featureOpenClaw) {
      this.logger.warn('OpenClaw 已关闭，跳过执行');
      return this.buildToolReplyAndSave(
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
      conversationId, userMsg, userInput, personaDto,
      clawResult.success ? clawResult.content : null,
      clawResult.success ? null : (clawResult.error || null),
      intentState,
      { openclawUsed: true }, trace, pipelineState, recent,
    );
  }

  /** 缺必要参数时由小晴自然追问，不调用 OpenClaw */
  private async handleMissingParamsReply(
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    userInput: string,
    missingParams: string[],
    intentState: DialogueIntentState | null,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
  ) {
    const preparedContext = this.preparedContext;
    const paramLabel: Record<string, string> = { city: '城市或坐标', location: '城市或坐标', recipient: '收件人', to: '收件人', subject: '主题' };
    const paramNames = missingParams.map((p) => paramLabel[p.toLowerCase()] ?? p).join('、');
    const expressionText = this.router.buildExpressionPolicy(
      this.persona.getExpressionFields(personaDto),
      intentState ?? undefined,
    );
    const userProfileText = this.buildInjectedUserProfileText(
      preparedContext?.user.userProfile ?? await this.userProfile.getOrCreate(),
      { includeImpressionCore: this.featureImpressionCore, includeImpressionDetail: true },
    );

    trace.add('missing-params', '缺失参数追问', 'success', {
      missingParams,
      paramLabels: paramNames.split('、'),
    });

    const systemContent = [
      this.persona.buildPersonaPrompt(personaDto),
      '',
      expressionText,
      userProfileText,
      '',
      this.router.buildMetaFilterPolicy(personaDto.metaFilterPolicy),
      '',
      '用户想让你帮忙执行一件事，但还少一些关键信息，需要你自然地问 TA 补全。',
      `当前缺少的信息类型：${paramNames}。`,
      '请沿用上面的人格与表达字段，用自然口语问用户要这些信息，不要提「系统」「参数」「缺少」等词，一句或两句即可。',
    ].join('\n');
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: systemContent },
      { role: 'user', content: `用户说：${userInput}` },
    ];

    const worldState = preparedContext?.world.fullWorldState ?? await this.worldState.get(conversationId);
    const growthContext = preparedContext?.growth.growthContext ?? await this.cognitiveGrowth.getGrowthContext();
    const claimCtx = preparedContext?.claims ?? await this.buildClaimAndSessionContext(conversationId);
    const followupCognitiveState = this.cognitivePipeline.analyzeTurn({
      userInput,
      recentMessages: [],
      intentState,
      worldState,
      growthContext,
      claimSignals: claimCtx.claimSignals,
      sessionState: claimCtx.sessionState,
    });
    this.recordPipelineStep(trace, pipelineState, 'cognition', {
      path: 'missing-params',
      situation: followupCognitiveState.situation.kind,
      userEmotion: followupCognitiveState.userState.emotion,
      userNeedMode: followupCognitiveState.userState.needMode,
      responseStrategy: followupCognitiveState.responseStrategy,
      rhythm: followupCognitiveState.rhythm,
      safety: followupCognitiveState.safety,
      missingParams,
    });
    this.recordPipelineStep(trace, pipelineState, 'expression', {
      path: 'missing-params',
      phase: 'pre-llm',
      inputMessages: messages.length,
      model: this.llm.getModelInfo({ scenario: 'chat' }),
    });

    const rawReplyContent = await trace.wrap('llm-generate', '生成追问回复', async () => {
      const content = await this.llm.generate(messages, { scenario: 'chat' });
      return {
        status: 'success' as const,
        detail: {
          model: this.llm.getModelInfo({ scenario: 'chat' }),
          inputMessages: messages.length,
          mode: 'missing-params-followup',
        },
        result: content,
      };
    });
    const filteredReplyContent = this.applyMetaLayerFilter(
      rawReplyContent,
      personaDto.metaFilterPolicy,
      trace,
      'missing-params',
    );
    const review = this.boundaryGovernance.reviewGeneratedReply(filteredReplyContent, followupCognitiveState);
    if (review.adjusted) {
      trace.add('boundary-governance', '边界治理复核', 'success', {
        adjusted: true,
        reasons: review.reasons,
        path: 'missing-params',
      });
    }
    const replyContent = review.content;
    this.recordPipelineStep(trace, pipelineState, 'expression', {
      path: 'missing-params',
      phase: 'post-llm',
      rawLength: rawReplyContent.length,
      filteredLength: filteredReplyContent.length,
      finalLength: replyContent.length,
      metaAdjusted: rawReplyContent !== filteredReplyContent,
      boundaryAdjusted: review.adjusted,
      boundaryReasons: review.reasons,
    });

    const assistantMsg = await this.prisma.message.create({
      data: { conversationId, role: 'assistant', content: replyContent, tokenCount: estimateTokens(replyContent) },
    });

    this.cognitiveGrowth
      .recordTurnGrowth(followupCognitiveState, [userMsg.id, assistantMsg.id])
      .catch((err) => this.logger.warn(`Failed to record cognitive growth (missing params): ${err}`));

    const debugMeta = this.featureDebugMeta
      ? { pipeline: this.buildPipelineSnapshot(pipelineState) }
      : undefined;

    return {
      userMessage: { id: userMsg.id, role: userMsg.role, content: userMsg.content, createdAt: userMsg.createdAt },
      assistantMessage: { id: assistantMsg.id, role: assistantMsg.role, content: assistantMsg.content, createdAt: assistantMsg.createdAt },
      injectedMemories: [],
      ...(debugMeta && { debugMeta }),
      trace: trace.getTrace(),
    };
  }

  // ── 原有聊天路径（提取为独立方法）──────────────────────────
  private async handleChatReply(
    conversationId: string,
    userMsg: { id: string; role: string; content: string; createdAt: Date },
    recent: Array<{ role: string; content: string }>,
    personaDto: PersonaDto,
    trace: TraceCollector,
    pipelineState: PipelineTraceState,
    intentState?: DialogueIntentState | null,
  ) {
    const personaPrompt = this.persona.buildPersonaPrompt(personaDto);
    const preparedContext = this.preparedContext;
    const userProfile = preparedContext?.user.userProfile ?? await this.userProfile.getOrCreate();
    const memoryBudget = preparedContext?.memory.memoryBudgetTokens ?? 0;
    const finalMemories = preparedContext?.memory.injectedMemories ?? [];
    const needDetail = preparedContext?.memory.needDetail ?? false;
    const candidatesCount = preparedContext?.memory.candidatesCount ?? finalMemories.length;

    // ── 记录命中 + 获取身份锚定 ────────────────────────────
    const hitIds = finalMemories.map((m) => m.id);
    if (hitIds.length > 0) {
      this.memoryDecay.recordHits(hitIds).catch((err) =>
        this.logger.warn(`Failed to record memory hits: ${err}`),
      );
    }
    const activeAnchors = await this.identityAnchor.getActiveAnchors();
    const anchorText = this.identityAnchor.buildAnchorText(activeAnchors);

    // ── 构建 prompt（注入 World State 供「几点了」等推理前提）─────────────────
    const worldState = await this.worldState.get(conversationId);
    const growthContext = await this.cognitiveGrowth.getGrowthContext();
    const claimCtx = await this.buildClaimAndSessionContext(conversationId);
    const cognitiveState: CognitiveTurnState = this.cognitivePipeline.analyzeTurn({
      userInput: userMsg.content,
      recentMessages: recent,
      intentState: intentState ?? null,
      worldState,
      growthContext,
      claimSignals: claimCtx.claimSignals,
      sessionState: claimCtx.sessionState,
    });
    const boundaryPreflight = this.boundaryGovernance.buildPreflight(cognitiveState);
    const boundaryPrompt: BoundaryPromptContext = {
      preflightText: this.boundaryGovernance.buildPreflightPrompt(boundaryPreflight) || null,
    };

    trace.add('cognitive-pipeline', '认知管道', 'success', {
      phase1: cognitiveState.phasePlan.phase1,
      phase2: cognitiveState.phasePlan.phase2,
      phase3: cognitiveState.phasePlan.phase3,
      situation: cognitiveState.situation.kind,
      userEmotion: cognitiveState.userState.emotion,
      userNeedMode: cognitiveState.userState.needMode,
      responseStrategy: cognitiveState.responseStrategy,
      rhythm: cognitiveState.rhythm,
      safety: cognitiveState.safety,
      growthContext,
      boundaryPreflight,
    });
    this.recordPipelineStep(trace, pipelineState, 'cognition', {
      path: 'chat',
      phasePlan: cognitiveState.phasePlan,
      situation: cognitiveState.situation,
      userState: cognitiveState.userState,
      responseStrategy: cognitiveState.responseStrategy,
      rhythm: cognitiveState.rhythm,
      safety: cognitiveState.safety,
      boundaryPreflight,
    });

    const userProfileText = this.buildInjectedUserProfileText(userProfile, {
      includeImpressionCore: this.featureImpressionCore,
      includeImpressionDetail: this.featureImpressionDetail && needDetail,
    });

    let messages = this.router.buildChatMessages({
      messages: recent as Array<{ role: 'user' | 'assistant'; content: string }>,
      personaPrompt,
      expressionFields: this.persona.getExpressionFields(personaDto),
      userProfileText,
      memories: finalMemories,
      identityAnchor: anchorText,
      intentState: intentState ?? undefined,
      worldState,
      cognitiveState,
      growthContext,
      claimPolicyText: claimCtx.claimPolicyText,
      sessionStateText: claimCtx.sessionStateText,
      boundaryPrompt,
      metaFilterPolicy: personaDto.metaFilterPolicy,
    });

    // ── History 截断（system prompt 不截断）────────────────
    const estimatedTokens = estimateMessagesTokens(
      messages.map((m) => ({ role: String(m.role), content: String(m.content ?? '') })),
    );
    const truncated = estimatedTokens > this.maxContextTokens;
    if (truncated) {
      messages = truncateToTokenBudget(
        messages.map((m) => ({ role: String(m.role), content: String(m.content ?? '') })),
        this.maxContextTokens,
      ) as typeof messages;
    }

    trace.add('prompt-build', 'Prompt 构建', 'success', {
      promptVersion: CHAT_PROMPT_VERSION,
      systemPromptTokens: estimateTokens(messages[0]?.content as string ?? ''),
      historyRounds: this.lastNRounds,
      actualMessagesUsed: recent.length,
      estimatedTotalTokens: estimatedTokens,
      maxContextTokens: this.maxContextTokens,
      truncated,
      systemPromptPreview: this.previewText(String(messages[0]?.content ?? ''), 480),
      impressionCoreInjected: this.featureImpressionCore && !!userProfile.impressionCore,
      impressionDetailInjected: this.featureImpressionDetail && needDetail && !!userProfile.impressionDetail,
    });
    this.recordPipelineStep(trace, pipelineState, 'expression', {
      path: 'chat',
      phase: 'pre-llm',
      promptVersion: CHAT_PROMPT_VERSION,
      systemPromptTokens: estimateTokens(messages[0]?.content as string ?? ''),
      inputMessages: messages.length,
      estimatedTotalTokens: estimatedTokens,
      truncated,
      model: this.llm.getModelInfo({ scenario: 'chat' }),
    });

    const rawReplyContent = await trace.wrap('llm-generate', '生成回复', async () => {
      const content = await this.llm.generate(messages, { scenario: 'chat' });
      return {
        status: 'success' as const,
        detail: {
          model: this.llm.getModelInfo({ scenario: 'chat' }),
          inputMessages: messages.length,
          mode: 'chat',
        },
        result: content,
      };
    });
    const filteredReplyContent = this.applyMetaLayerFilter(
      rawReplyContent,
      personaDto.metaFilterPolicy,
      trace,
      'chat',
    );
    const reviewedReply = this.boundaryGovernance.reviewGeneratedReply(filteredReplyContent, cognitiveState);
    if (reviewedReply.adjusted) {
      trace.add('boundary-governance', '边界治理复核', 'success', {
        adjusted: true,
        reasons: reviewedReply.reasons,
      });
    }
    const replyContent = reviewedReply.content;
    this.recordPipelineStep(trace, pipelineState, 'expression', {
      path: 'chat',
      phase: 'post-llm',
      rawLength: rawReplyContent.length,
      filteredLength: filteredReplyContent.length,
      finalLength: replyContent.length,
      metaAdjusted: rawReplyContent !== filteredReplyContent,
      boundaryAdjusted: reviewedReply.adjusted,
      boundaryReasons: reviewedReply.reasons,
    });

    this.pet.setStateWithAutoIdle('speaking', 3000);

    let assistantMsg = await this.prisma.message.create({
      data: { conversationId, role: 'assistant', content: replyContent, tokenCount: estimateTokens(replyContent) },
    });

    let dailyMomentMeta: SendMessageResult['dailyMoment'] | undefined;
    const summarizeTrigger: 'instant' | 'threshold' = this.shouldInstantSummarize(userMsg.content)
      ? 'instant'
      : 'threshold';
    const postPlan: PostTurnPlan = {
      conversationId,
      turn: {
        turnId: userMsg.id,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        userInput: userMsg.content,
        assistantOutput: assistantMsg.content,
        now: new Date(),
      },
      context: {
        intentState: intentState ?? null,
        cognitiveState,
        isImportantIssueInProgress:
          cognitiveState.situation.kind === 'decision_support' ||
          cognitiveState.situation.kind === 'advice_request' ||
          cognitiveState.situation.kind === 'task_execution',
      },
      beforeReturn: [{ type: 'daily_moment_suggestion' }],
      afterReturn: [{ type: 'record_growth' }, { type: 'summarize_trigger', trigger: summarizeTrigger }],
    };
    await this.postTurnPipeline.runBeforeReturn(
      postPlan,
      async (task) => {
        if (task.type !== 'daily_moment_suggestion') return;
        const dailyMomentSuggestion = await this.runDailyMomentPostResponseHook({
          conversationId,
          intentState: intentState ?? null,
          isImportantIssueInProgress: !!postPlan.context.isImportantIssueInProgress,
          now: postPlan.turn.now,
        });
        if (!dailyMomentSuggestion) return;
        const mergedContent = `${assistantMsg.content}\n\n${dailyMomentSuggestion.hint}`;
        assistantMsg = await this.prisma.message.update({
          where: { id: assistantMsg.id },
          data: {
            content: mergedContent,
            tokenCount: estimateTokens(mergedContent),
          },
        });
        dailyMomentMeta = {
          mode: 'suggestion',
          suggestion: dailyMomentSuggestion,
        };
      },
    );
    this.postTurnPipeline.runAfterReturn(
      postPlan,
      async (task) => this.runPostTurnTask(task, postPlan, { trace, userMsgId: userMsg.id, assistantMsgId: assistantMsg.id }),
    ).catch((err) => this.logger.warn(`Post-turn pipeline failed: ${String(err)}`));

    // ── Debug Meta（保留兼容）─────────────────────────────
    const debugMeta = this.featureDebugMeta ? {
      model: this.llm.getModelInfo({ scenario: 'chat' }),
      context: {
        historyRounds: this.lastNRounds,
        actualMessagesUsed: recent.length,
        estimatedTokens,
        maxContextTokens: this.maxContextTokens,
        truncated,
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
        systemPromptTokens: estimateTokens(messages[0]?.content as string ?? ''),
        systemPromptPreview: this.previewText(String(messages[0]?.content ?? ''), 1400),
        messagePreview: messages.slice(0, 6).map((m) => ({
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

    return {
      userMessage: {
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
        createdAt: userMsg.createdAt,
      },
      assistantMessage: {
        id: assistantMsg.id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        createdAt: assistantMsg.createdAt,
      },
      injectedMemories: finalMemories,
      ...(dailyMomentMeta && { dailyMoment: dailyMomentMeta }),
      ...(debugMeta && { debugMeta }),
      trace: trace.getTrace(),
    };
  }

  private async runPostTurnTask(
    task: PostTurnTask,
    plan: PostTurnPlan,
    input: { trace?: TraceCollector; userMsgId: string; assistantMsgId: string },
  ): Promise<void> {
    if (task.type === 'record_growth') {
      if (!plan.context.cognitiveState) return;
      await this.cognitiveGrowth.recordTurnGrowth(plan.context.cognitiveState, [
        input.userMsgId,
        input.assistantMsgId,
      ]);
      return;
    }
    if (task.type === 'summarize_trigger') {
      // summarize 已外提到 SummarizeTriggerService，由 Orchestrator 统一触发。
      return;
    }
  }

  private async runDailyMomentPostResponseHook(input: {
    conversationId: string;
    intentState: DialogueIntentState | null;
    isImportantIssueInProgress: boolean;
    now: Date;
  }): Promise<DailyMomentSuggestion | null> {
    const recentMessages = await this.getLastNDailyMomentMessages(input.conversationId);
    if (recentMessages.length < 3) return null;

    const suggestionCheck = await this.dailyMoment.maybeSuggest({
      conversationId: input.conversationId,
      recentMessages,
      now: input.now,
      triggerContext: {
        intentMode: input.intentState?.mode ?? null,
        intentRequiresTool: input.intentState?.requiresTool ?? false,
        intentSeriousness: input.intentState?.seriousness ?? null,
        detectedEmotion: input.intentState?.detectedEmotion ?? null,
        isImportantIssueInProgress: input.isImportantIssueInProgress,
      },
    });

    return suggestionCheck.shouldSuggest ? suggestionCheck.suggestion ?? null : null;
  }

  private async buildClaimAndSessionContext(conversationId: string): Promise<{
    claimSignals: ClaimSignal[];
    claimPolicyText: string;
    sessionState: SessionStateSignal | null;
    sessionStateText: string;
    injectedClaimsDebug: Array<{ type: string; key: string; confidence: number; status: string }>;
    draftClaimsDebug: Array<{ type: string; key: string; confidence: number; status: string }>;
  }> {
    const claimSignals: ClaimSignal[] = [];
    let claimPolicyText = '';
    let sessionState: SessionStateSignal | null = null;
    let sessionStateText = '';
    const injectedClaimsDebug: Array<{ type: string; key: string; confidence: number; status: string }> = [];
    let draftClaimsDebug: Array<{ type: string; key: string; confidence: number; status: string }> = [];

    if (this.claimConfig.readNewEnabled && this.claimConfig.injectionEnabled) {
      const topByType: Record<string, number> = {
        JUDGEMENT_PATTERN: 3,
        VALUE: 3,
        INTERACTION_PREFERENCE: 6,
        EMOTIONAL_TENDENCY: 3,
        RELATION_RHYTHM: 2,
      };
      const rows = await this.claimSelector.getInjectableClaims('default-user', topByType, {
        typePriority: [
          'INTERACTION_PREFERENCE', // ip.* first
          'RELATION_RHYTHM', // rr.* next
          'EMOTIONAL_TENDENCY',
          'JUDGEMENT_PATTERN',
          'VALUE',
        ],
      });
      for (const row of rows) {
        const value = typeof row.valueJson === 'string'
          ? row.valueJson
          : JSON.stringify(row.valueJson);
        injectedClaimsDebug.push({
          type: row.type,
          key: row.key,
          confidence: row.confidence,
          status: row.status,
        });
        claimSignals.push({
          type: row.type,
          key: row.key,
          value,
          confidence: row.confidence,
        });
      }
      if (claimSignals.length > 0) {
        const header = '[长期 Claims（stable/core）]';
        const lines: string[] = [header];
        let used = estimateTokens(header);
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
        const safe: SessionStateSignal = {};
        const mood = typeof data.mood === 'string' ? data.mood : undefined;
        const energy = typeof data.energy === 'string' ? data.energy : undefined;
        const focus = typeof data.focus === 'string' ? data.focus : undefined;
        const taskIntent = typeof data.taskIntent === 'string' ? data.taskIntent : undefined;
        if (mood) safe.mood = mood;
        if (energy) safe.energy = energy;
        if (focus) safe.focus = focus;
        if (taskIntent) safe.taskIntent = taskIntent;
        safe.confidence = fresh.confidence;
        if (Object.keys(safe).length > 0) {
          sessionState = safe;
          const lines = [
            '[SessionState（TTL 内短期状态）]',
            mood ? `- mood: ${mood}` : '',
            energy ? `- energy: ${energy}` : '',
            focus ? `- focus: ${focus}` : '',
            taskIntent ? `- taskIntent: ${taskIntent}` : '',
            `- confidence: ${fresh.confidence.toFixed(2)}`,
          ].filter(Boolean);
          sessionStateText = lines.join('\n');
        }
      }
    }

    if (this.featureDebugMeta && this.claimConfig.readNewEnabled) {
      const rows = await this.claimSelector.getDraftClaimsForDebug('default-user', {
        perTypeLimit: 6,
        totalLimit: 60,
      });
      draftClaimsDebug = rows.map((r) => ({
        type: r.type,
        key: r.key,
        confidence: r.confidence,
        status: r.status,
      }));
    }

    return { claimSignals, claimPolicyText, sessionState, sessionStateText, injectedClaimsDebug, draftClaimsDebug };
  }

  private applyMetaLayerFilter(
    content: string,
    policy: string,
    trace?: TraceCollector,
    path?: string,
  ): string {
    const filtered = this.metaLayer.filter(content, policy);
    if (filtered.adjusted) {
      trace?.add('meta-layer', 'Meta Layer 过滤', 'success', {
        adjusted: true,
        reasons: filtered.reasons,
        removedSegments: filtered.removedSegments,
        rewrittenSegments: filtered.rewrittenSegments,
        path: path ?? 'unknown',
      });
    }
    return filtered.content;
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

  // ── Identity Update → IdentityAnchor ────────────────────
  private static readonly IDENTITY_LABEL_MAP: Record<string, string> = {
    city: 'location',
    timezone: 'timezone',
    language: 'language',
    conversationMode: 'custom',
  };

  private async writeIdentityUpdate(
    update: import('../intent/intent.types').IdentityUpdateFromIntent,
    trace: TraceCollector,
  ): Promise<void> {
    const entries = Object.entries(update).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0,
    );
    if (entries.length === 0) return;

    const anchors = await this.identityAnchor.getActiveAnchors();
    const written: string[] = [];

    for (const [key, value] of entries) {
      const label = ChatCompletionEngine.IDENTITY_LABEL_MAP[key];
      if (!label) continue;

      const existing = anchors.find((a) => a.label === label);
      if (existing) {
        if (existing.content !== value) {
          await this.identityAnchor.update(existing.id, { content: value });
          written.push(`${label}: ${existing.content} → ${value}`);
        }
      } else if (anchors.length < 5) {
        await this.identityAnchor.create({ label, content: value });
        anchors.push({ label, content: value } as any); // track count
        written.push(`${label}: (new) ${value}`);
      } else {
        this.logger.warn(`IdentityAnchor at capacity (5), skipping: ${label}=${value}`);
      }
    }

    if (written.length > 0) {
      trace.add('identity-update', '身份锚定更新', 'success', { written });
      this.logger.log(`Identity anchors updated: ${written.join('; ')}`);
    }
  }

  // ── Auto Summarize ──────────────────────────────────────
  private async maybeAutoSummarize(conversationId: string, trace?: TraceCollector): Promise<void> {
    if (!this.featureAutoSummarize) return;
    if (this.summarizingConversations.has(conversationId)) return;

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        summarizedAt: true,
        _count: { select: { messages: true } },
      },
    });
    if (!conv) return;

    // 计算 summarizedAt 之后的新用户消息数
    const newUserMessages = await this.prisma.message.count({
      where: {
        conversationId,
        role: 'user',
        ...(conv.summarizedAt ? { createdAt: { gt: conv.summarizedAt } } : {}),
      },
    });

    if (newUserMessages < this.autoSummarizeThreshold) return;

    trace?.add('auto-summarize', '自动总结（阈值触发）', 'success', {
      trigger: 'threshold',
      newUserMessages,
      threshold: this.autoSummarizeThreshold,
    });

    this.summarizingConversations.add(conversationId);
    try {
      this.logger.log(
        `Auto-summarize triggered: ${newUserMessages} new user messages (threshold: ${this.autoSummarizeThreshold})`,
      );

      // 只总结 summarizedAt 之后的消息，避免重复
      const newMessageIds = conv.summarizedAt
        ? (await this.prisma.message.findMany({
            where: { conversationId, createdAt: { gt: conv.summarizedAt } },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          })).map(m => m.id)
        : undefined; // 首次总结走默认逻辑（全部消息）

      const result = await this.summarizer.summarize(conversationId, newMessageIds);
      if (result.created > 0) {
        await this.triggerAutoEvolution(conversationId, trace);
      }
    } finally {
      this.summarizingConversations.delete(conversationId);
    }
  }

  // ── Instant Summarize（关键词即时触发）─────────────────
  private shouldInstantSummarize(userContent: string): boolean {
    if (!this.featureInstantSummarize) return false;
    return ChatCompletionEngine.INSTANT_SUMMARIZE_RE.test(userContent);
  }

  private async instantSummarize(conversationId: string, userContent: string, trace?: TraceCollector): Promise<void> {
    if (this.summarizingConversations.has(conversationId)) return;
    this.summarizingConversations.add(conversationId);
    try {
      this.logger.log(`Instant-summarize triggered by keyword in: "${userContent.slice(0, 30)}..."`);

      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { summarizedAt: true },
      });

      const newMessageIds = conv?.summarizedAt
        ? (await this.prisma.message.findMany({
            where: { conversationId, createdAt: { gt: conv.summarizedAt } },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          })).map(m => m.id)
        : undefined;

      const result = await this.summarizer.summarize(conversationId, newMessageIds);
      if (result.created > 0) {
        await this.triggerAutoEvolution(conversationId, trace);
      }
    } finally {
      this.summarizingConversations.delete(conversationId);
    }
  }

  private buildInjectedUserProfileText(
    profile: UserProfileDto,
    opts: { includeImpressionCore: boolean; includeImpressionDetail: boolean },
  ): string {
    return this.userProfile.buildPrompt({
      ...profile,
      impressionCore: opts.includeImpressionCore ? profile.impressionCore : null,
      impressionDetail: opts.includeImpressionDetail ? profile.impressionDetail : null,
    });
  }

  // ── Auto Evolution（总结后自动触发进化建议）─────────────
  private async triggerAutoEvolution(conversationId: string, trace?: TraceCollector): Promise<void> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (messages.length === 0) return;

    const recent = messages.reverse().map(m => ({ role: m.role, content: m.content }));
    const result = await this.persona.suggestEvolution(recent);
    if (result.changes.length > 0) {
      const isUserPref = (field: string) =>
        field === 'preferredVoiceStyle'
        || field === 'praisePreference'
        || field === 'responseRhythm';
      const preferenceChanges = result.changes.filter((c) => isUserPref(c.targetField ?? c.field));
      const personaChanges = result.changes.filter((c) => !isUserPref(c.targetField ?? c.field));

      if (preferenceChanges.length > 0) {
        const applied = await this.persona.confirmEvolution(preferenceChanges);
        trace?.add('auto-evolution', '用户偏好自动应用', applied.accepted ? 'success' : 'fail', {
          autoAppliedPreferences: preferenceChanges.length,
          accepted: applied.accepted,
          reason: applied.reason,
        });
      }

      if (personaChanges.length === 0) {
        this.logger.log(
          `Auto-evolution: auto-applied ${preferenceChanges.length} user-preference changes, no persona changes pending`,
        );
        return;
      }

      this.evolutionScheduler.setPendingSuggestion({
        changes: personaChanges,
        triggerReason: '自动总结后触发',
        createdAt: new Date(),
      });
      trace?.add('auto-evolution', '人格进化建议', 'success', {
        suggestionsCount: personaChanges.length,
        fields: personaChanges.map(c => c.field),
        autoAppliedPreferences: preferenceChanges.length,
      });
      this.logger.log(
        `Auto-evolution: ${personaChanges.length} persona suggestions pending, ${preferenceChanges.length} preference changes auto-applied`,
      );
    }
  }

}
