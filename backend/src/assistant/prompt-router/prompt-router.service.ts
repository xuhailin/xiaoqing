import { Injectable, Logger } from '@nestjs/common';
import type { OpenAI } from 'openai';
import { LlmService } from '../../infra/llm/llm.service';
import { assertTokenBudget, estimateTokens } from '../../infra/token-estimator';
import type { MemoryCandidate } from '../memory/memory.service';
import type { WorldState } from '../../infra/world-state/world-state.types';
import type { ExpressionFields } from '../persona/persona.service';
import type {
  BoundaryPromptContext,
  CognitiveTurnState,
  PersistedGrowthContext,
} from '../cognitive-pipeline/cognitive-pipeline.types';
import { ClaimSchemaRegistry, CLAIM_KEYS } from '../claim-engine/claim-schema.registry';
import type { SystemSelf } from '../../system-self/system-self.types';
import type { TaskPlan } from '../planning/task-planner.types';
import type { ActionDecision } from '../action-reasoner/action-reasoner.types';
import type { SharedExperienceRecord } from '../shared-experience/shared-experience.types';
import type { SocialEntityRecord } from '../life-record/social-entity/social-entity.types';
import type { SocialInsightRecord } from '../life-record/social-insight/social-insight.types';
import type { RelevantSocialRelationEdgeRecord } from '../life-record/social-relation-edge/social-relation-edge.types';
import type { CollaborationTurnContext } from '../conversation/orchestration.types';
import type { ExpressionControlState } from '../conversation/expression-control.types';
import type { CommitmentSignal } from '../conversation/orchestration.types';

export const CHAT_PROMPT_VERSION = 'chat_v6';
export const SUMMARY_PROMPT_VERSION = 'summary_v2';
export const MEMORY_ANALYSIS_PROMPT_VERSION = 'memory_analysis_v1';
export const RANK_PROMPT_VERSION = 'rank_v1';
export const TOOL_WRAP_PROMPT_VERSION = 'tool_wrap_v1';

export type RouterMode = 'chat' | 'summary';

/**
 * Chat 上下文（唯一可读 memory / claim / recent messages 的链路）。
 * 上下文边界与约束见 docs/context-boundary.md。
 */
export interface ChatContext {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 人格层 prompt（由 PersonaService.buildPersonaPrompt 构建） */
  personaPrompt?: string;
  /** 表达调度层字段（由 PersonaService.getExpressionFields 提取） */
  expressionFields?: ExpressionFields;
  /** 元过滤规则：限制输出暴露内部策略/逻辑 */
  metaFilterPolicy?: string | null;
  /** 用户画像：含印象与回应偏好 */
  userProfileText?: string | null;
  memories?: Array<{ id: string; type: string; content: string }>;
  /** 身份锚定文本，始终注入在 persona 之后、记忆之前 */
  identityAnchor?: string | null;
  /** 用户认可的首选昵称（来自 ip.nickname.primary claim），用于“固定称呼”指引注入 */
  preferredNickname?: string | null;
  /** 默认世界状态（地点/时区/语言等），用于「几点了」「适合出门吗」等推理前提，不写入记忆 */
  worldState?: WorldState | null;
  /** 认知管道的结构化输出，作为生成前的稳定决策层 */
  cognitiveState?: CognitiveTurnState;
  /** 二期成长层：来自长期沉淀的认知画像与关系状态 */
  growthContext?: PersistedGrowthContext;
  /** 当前仍在生效的计划/约定，来自 Plan / TaskOccurrence 主事实源 */
  commitments?: CommitmentSignal[];
  /** 三期治理层：生成前边界预检指令 */
  boundaryPrompt?: BoundaryPromptContext | null;
  /** 四期：长期 claim 注入（仅 stable/core） */
  claimPolicyText?: string | null;
  /** 四期：会话短期状态（TTL 内） */
  sessionStateText?: string | null;
  /** B4：当前对话相关的共同经历 */
  sharedExperiences?: SharedExperienceRecord[];
  /** B4：最近几次对话观察到的互动节奏 */
  rhythmObservations?: string[];
  /** A2：当前话题相关的人物认知 */
  socialEntities?: SocialEntityRecord[];
  /** A4：社会关系洞察 */
  socialInsights?: SocialInsightRecord[];
  /** A4：当前话题相关的关系变化信号 */
  socialRelationSignals?: RelevantSocialRelationEdgeRecord[];
  /** 系统自省信息：系统名称、版本、能力列表等 */
  systemSelf?: SystemSelf;
  /** 上一轮反思结果：用于改进本轮决策 */
  previousReflection?: {
    quality: 'good' | 'suboptimal' | 'failed';
    adjustmentHint: string;
    timestamp: Date;
  };
  /** 任务规划结果：多步骤任务的执行计划 */
  taskPlan?: TaskPlan;
  /** 行动决策：包含 action、capability、reason 等决策上下文 */
  actionDecision?: ActionDecision;
  /** 由 DecisionSummaryBuilder 生成的决策摘要文本（优先于 actionDecision 内联构建） */
  decisionSummaryText?: string;
  /** 协作上下文：当前是 agent 间委托，而非直接前台聊天 */
  collaborationContext?: CollaborationTurnContext | null;
  /** 结构化表达控制状态：昵称、节奏、边界等优先从这里读取 */
  expressionControl?: ExpressionControlState;
}

export interface SummaryContext {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  messageIds: string[];
}

/** 已有长期认知条目，供记忆分析引擎判似用 */
export interface ExistingCognitiveMemory {
  id: string;
  content: string;
}

export interface ToolResultContext {
  personaText: string;
  expressionText?: string;
  userProfileText?: string;
  metaFilterPolicy?: string | null;
  /** 用户认可的首选昵称（来自 ip.nickname.primary claim） */
  preferredNickname?: string | null;
  expressionControl?: ExpressionControlState;
  toolKind?: 'weather' | 'book_download' | 'general_action' | 'timesheet' | 'reminder' | 'page_screenshot' | 'openclaw';
  userInput: string;
  toolResult: string | null;
  toolError: string | null;
  /** 执行状态，用于生成不同语气的结果包装。未提供时按 toolResult 是否存在二元判断。 */
  executionStatus?: 'success' | 'failed' | 'need_clarification' | 'partial_success' | 'timeout';
  recentMessages?: { role: string; content: string }[];
  collaborationContext?: CollaborationTurnContext | null;
}

interface PromptBlock {
  id: string;
  priority: number;
  content: string;
}

@Injectable()
export class PromptRouterService {
  private readonly logger = new Logger(PromptRouterService.name);

  constructor(private llm: LlmService) {}

  private isDebugPromptEnabled(): boolean {
    // 与现有仓库约定对齐：FEATURE_DEBUG_META 默认 false，仅在显式开启时输出日志
    return process.env.FEATURE_DEBUG_META === 'true';
  }

  private countBullets(blockText: string): number {
    return blockText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- ')).length;
  }

  buildNicknameHint(
    nickname?: string | null,
    expressionControl?: ExpressionControlState,
  ): string {
    const name = nickname?.trim();
    if (!name) return '';
    if (expressionControl && !expressionControl.useNickname) return '';
    return `称呼她时请用"${name}"——这是她认可的昵称。如果场景不适合用昵称（如严肃讨论），可以不用，但日常聊天优先使用。`;
  }

  buildChatMessages(ctx: ChatContext): OpenAI.Chat.ChatCompletionMessageParam[] {
    /**
     * PROMPT BLOCK ARCHITECTURE (chat_v6)
     *
     * 五层优先级（越靠后越接近最终输出约束）：
     *
     * [Tier 1 - 身份层]
     * - personaPrompt
     * - systemSelfPart
     * - identityAnchorPart
     *
     * [Tier 2 - 知识层]
     * - userProfilePart
     * - longTermSummaryPart
     * - memoryPart
     *
     * [Tier 3 - 上下文层]
     * - worldStatePart
     * - socialSummaryPart
     * - collaborationPart
     * - reflectionPart
     * - taskPlanPart
     *
     * [Tier 4 - 决策层]
     * - cognitivePart
     * - decisionContextPart
     * - actionHintPart
     * - boundaryPart
     *
     * [Tier 5 - 表达层]
     * - expressionPart
     * - metaPart
     *
     * 规则：
     * - 新增 block 时先声明所属 Tier。
     * - 同 Tier 内优先保留更稳定、更高约束的信息。
     * - 表达层只负责“怎么说”，不再承载新的行为决策。
     */
    const personaPart = ctx.personaPrompt?.trim() ?? '';

    // —— 了解区：自然语言引导，无方括号 ——

    let identityAnchorPart = '';
    if (ctx.identityAnchor) {
      identityAnchorPart = `关于她：\n${ctx.identityAnchor}`;
    }

    const nicknamePart = this.buildNicknameHint(
      ctx.preferredNickname,
      ctx.expressionControl,
    );

    let memoryPart = '';
    if (ctx.memories?.length) {
      const lines = ctx.memories.map((m) => `- ${m.content}`);
      memoryPart = `[内部记忆参考]\n${lines.join('\n')}`;
    }

    let userProfilePart = '';
    if (ctx.userProfileText) {
      userProfilePart = ctx.userProfileText;
    }

    // —— 表达策略（一段话，无方括号）——
    const expressionPart = this.buildExpressionPolicy(
      ctx.expressionFields,
      ctx.expressionControl,
    );
    const metaPart = this.buildMetaFilterPolicy(ctx.metaFilterPolicy);
    // —— 背景信号（保留结构化格式，模型需要精确读取）——

    let worldStatePart = '';
    if (ctx.worldState && (ctx.worldState.city ?? ctx.worldState.timezone ?? ctx.worldState.language)) {
      const lines: string[] = ['[默认世界状态（未显式变更前默认成立，不要反复追问）]'];
      if (ctx.worldState.city) lines.push(`- 地点：${ctx.worldState.city}`);
      if (ctx.worldState.timezone) lines.push(`- 时区：${ctx.worldState.timezone}`);
      if (ctx.worldState.language) lines.push(`- 语言：${ctx.worldState.language}`);
      worldStatePart = lines.join('\n');
    }

    let commitmentPart = '';
    if (ctx.commitments?.length) {
      const lines = ['[当前活跃承诺/计划]'];
      ctx.commitments.slice(0, 4).forEach((item) => {
        const body = item.summary?.trim() || item.title;
        lines.push(`- ${item.title}${body && body !== item.title ? `：${body}` : ''}`);
      });
      commitmentPart = lines.join('\n');
    }

    const cognitivePart = this.buildCognitivePolicy(ctx.cognitiveState);
    const longTermSummaryPart = this.buildLongTermSummaryPart(ctx.growthContext, ctx.claimPolicyText);
    const boundaryPart = this.buildBoundaryPolicy(ctx.boundaryPrompt);
    const socialSummaryPart = this.buildSocialContextSummaryPart({
      sharedExperiences: ctx.sharedExperiences,
      rhythmObservations: ctx.rhythmObservations,
      socialEntities: ctx.socialEntities,
      socialInsights: ctx.socialInsights,
      socialRelationSignals: ctx.socialRelationSignals,
    });
    const collaborationPart = this.buildCollaborationContextPrompt(ctx.collaborationContext);

    // 决策上下文：仅使用 DecisionSummaryBuilder 的摘要（若为空则不注入）
    const decisionContextPart = ctx.decisionSummaryText ?? '';

    let actionHintPart = '';
    if (ctx.actionDecision?.action === 'handoff_dev') {
      actionHintPart = '[行动提示] 用户本轮可能是开发/编程类任务。若适合交给开发代理，可在回复中自然建议对方使用 /dev 前缀重新发送。';
    } else if (ctx.actionDecision?.action === 'suggest_reminder' && ctx.actionDecision.reminderHint) {
      actionHintPart = `[行动提示] 用户提到了将来要做的事（${ctx.actionDecision.reminderHint}）。可在回复中自然提议「要不要我帮你记一下」等，不要自动创建任务。`;
    }

    let reflectionPart = '';
    if (ctx.previousReflection) {
      reflectionPart = `[上轮反思] 质量=${ctx.previousReflection.quality}，调整建议：${ctx.previousReflection.adjustmentHint}`;
    }

    let taskPlanPart = '';
    if (ctx.taskPlan && ctx.taskPlan.shouldPlan) {
      const lines = [
        '[任务规划]',
        `- 复杂度：${ctx.taskPlan.complexity === 'low' ? '低' : ctx.taskPlan.complexity === 'mid' ? '中' : '高'}`,
      ];
      if (ctx.taskPlan.steps && ctx.taskPlan.steps.length > 0) {
        lines.push('- 建议步骤：');
        ctx.taskPlan.steps.forEach((step, idx) => {
          lines.push(`  ${idx + 1}. ${step}`);
        });
      }
      if (ctx.taskPlan.estimatedMinutes) {
        lines.push(`- 预计耗时：${ctx.taskPlan.estimatedMinutes} 分钟`);
      }
      taskPlanPart = lines.join('\n');
    }

    let systemSelfPart = '';
    if (ctx.systemSelf) {
      const visibleCaps = ctx.systemSelf.capabilities.filter(c => c.visibility !== 'hidden');
      const activeAgents = ctx.systemSelf.agents.filter((agent) => agent.active);
      const collaborationAgents = activeAgents.filter((agent) => agent.name !== 'assistant');
      const collaborationAgentLines = collaborationAgents.map((agent) =>
        agent.description ? `- ${agent.name}（${agent.channel}）：${agent.description}` : `- ${agent.name}（${agent.channel}）`,
      );
      const capabilitySection = visibleCaps.length > 0
        ? [
            '[系统可用能力]',
            ...visibleCaps.map((c) => `- ${c.name}：${c.description || c.name}`),
          ].join('\n')
        : '[系统可用能力]\n- 当前无可执行外部能力（仅对话建议）';
      const agentSection = collaborationAgentLines.length > 0
        ? ['[可协作代理]', ...collaborationAgentLines].join('\n')
        : '';
      const selfIntroHint = '当用户询问你能做什么、你是谁、或要你做自我介绍时，请自然地提及上述能力和代理，挑重点说，不需要完整列举。';
      if (visibleCaps.length > 0) {
        const hasReminder = visibleCaps.some(c => c.name === 'reminder');
        systemSelfPart = hasReminder
          ? [capabilitySection, '注：reminder 能力可以设置真实的定时提醒（一次性、每天、每周），会在指定时间实际触发通知。', agentSection, selfIntroHint].filter(Boolean).join('\n')
          : [capabilitySection, agentSection, selfIntroHint].filter(Boolean).join('\n');
      } else {
        systemSelfPart = [capabilitySection, agentSection, selfIntroHint].filter(Boolean).join('\n');
      }
    }

    const tier1Identity = assertTokenBudget(
      [
        `[${CHAT_PROMPT_VERSION}]`,
        personaPart,
        systemSelfPart,
        identityAnchorPart,
      ].filter(Boolean).join('\n\n'),
      400,
      'tier1_identity',
      this.logger,
    );
    const tier2Knowledge = assertTokenBudget(
      [
        userProfilePart,
        longTermSummaryPart,
        memoryPart,
      ].filter(Boolean).join('\n\n'),
      300,
      'tier2_knowledge',
      this.logger,
    );
    const tier3Context = assertTokenBudget(
      [
        worldStatePart,
        commitmentPart,
        socialSummaryPart,
        collaborationPart,
        reflectionPart,
        taskPlanPart,
      ].filter(Boolean).join('\n\n'),
      200,
      'tier3_context',
      this.logger,
    );
    const tier4Decision = assertTokenBudget(
      [
        cognitivePart,
        decisionContextPart,
        actionHintPart,
        boundaryPart,
      ].filter(Boolean).join('\n\n'),
      250,
      'tier4_decision',
      this.logger,
    );
    const tier5Expression = assertTokenBudget(
      [
        nicknamePart,
        metaPart,
        expressionPart,
      ].filter(Boolean).join('\n\n'),
      150,
      'tier5_expression',
      this.logger,
    );

    const parts = this.assemblePromptBlocks([
      { id: 'tier1_identity', priority: 100, content: tier1Identity ?? '' },
      { id: 'tier2_knowledge', priority: 200, content: tier2Knowledge ?? '' },
      { id: 'tier3_context', priority: 300, content: tier3Context ?? '' },
      { id: 'tier4_decision', priority: 400, content: tier4Decision ?? '' },
      { id: 'tier5_expression', priority: 500, content: tier5Expression ?? '' },
    ]);

    if (this.isDebugPromptEnabled()) {
      const longTermBulletCount = this.countBullets(longTermSummaryPart);
      const socialBulletCount = this.countBullets(socialSummaryPart);
      // 注意：不打印正文，只打印 block 名称/存在性/条数/字符数，用于观察收敛是否生效
      // eslint-disable-next-line no-console
      console.debug('[PromptInjectObs]', {
        blocks: {
          longTermSummaryPart: {
            injected: longTermSummaryPart.trim().length > 0,
            bullets: longTermBulletCount,
            chars: longTermSummaryPart.length,
          },
          socialSummaryPart: {
            injected: socialSummaryPart.trim().length > 0,
            bullets: socialBulletCount,
            chars: socialSummaryPart.length,
          },
          sessionStatePart: { injected: false }, // chat 主路径不再直接注入
          boundaryPart: { injected: boundaryPart.trim().length > 0 },
          cognitivePart: { injected: cognitivePart.trim().length > 0 },
        },
        // 明确指出旧多块来源在 chat 主路径已关闭
        oldPromptParts: {
          growthPartInjected: false,
          claimPartInjected: false,
          sessionStatePartInjected: false,
          socialMultiBlocksInjected: {
            sharedExperiencePart: false,
            rhythmObservationPart: false,
            socialEntityPart: false,
            socialInsightPart: false,
            socialRelationPart: false,
          },
        },
      });
    }

    const system: OpenAI.Chat.ChatCompletionMessageParam = {
      role: 'system',
      content: parts.join('\n\n---\n\n'),
    };
    const history: OpenAI.Chat.ChatCompletionMessageParam[] = ctx.messages.map(
      (m) => ({ role: m.role, content: m.content }),
    );
    return [system, ...history];
  }

  private assemblePromptBlocks(blocks: PromptBlock[]): string[] {
    return blocks
      .filter((block) => block.content.trim().length > 0)
      .sort((left, right) => left.priority - right.priority)
      .map((block) => block.content);
  }

  /**
   * 长期画像摘要：合并原有 growthPart + claimPart 的信息入口，只在 chat prompt 中注入这一处。
   * 规则：以 stable/core 的 claims 为主，少量补充 growth 的趋势/关系/边界提示；最终 3~5 条 bullets。
   */
  private buildLongTermSummaryPart(
    growth?: PersistedGrowthContext,
    claimPolicyText?: string | null,
  ): string {
    const maxBullets = 5;
    const maxFromGrowth = 2;
    const maxFromClaim = maxBullets - maxFromGrowth;
    const minStableConf = 0.7;

    const stripBulletPrefix = (line: string) =>
      line.replace(/^([-*•]|\d+\.)\s*/u, '').trim();

    // claimPolicyText 的 bullet 格式目前在 assembler 中会以 "- " 起头，但为了防御格式轻微变化，
    // 这里直接从包含 "conf=" 的行抽取候选，避免依赖 startsWith('- ').
    const claimCandidates = (claimPolicyText ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.includes('conf='))
      .map((l) => {
        const content = stripBulletPrefix(l);
        const confMatch = content.match(/\(conf=([0-9.]+)\)/);
        const conf = confMatch ? Number(confMatch[1]) : null;
        return { content, conf };
      })
      .filter((c) => c.content.length > 0);

    const growthBullets = this.buildGrowthPolicy(growth)
      .split('\n')
      .map((l) => l.trim())
      // buildGrowthPolicy 的 bullet 行通常以 "- " 开头；这里同样用 stripBulletPrefix + bullet 前缀判断做防御
      .filter((l) => /^([-*•]|\d+\.)\s*/u.test(l))
      .map((l) => stripBulletPrefix(l));

    const seen = new Set<string>();
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const addUnique = (list: string[], content: string) => {
      const t = content?.trim();
      if (!t) return;
      const key = normalize(t);
      if (seen.has(key)) return;
      seen.add(key);
      list.push(t);
    };

    const stableClaimPick: string[] = [];
    const fallbackClaimPick: string[] = [];

    for (const c of claimCandidates) {
      if (c.content.length === 0) continue;
      if (c.conf != null && !Number.isNaN(c.conf) && c.conf >= minStableConf) {
        addUnique(stableClaimPick, c.content);
      } else {
        addUnique(fallbackClaimPick, c.content);
      }
      if (stableClaimPick.length >= maxFromClaim) break;
    }

    const pickClaim = stableClaimPick.length >= maxFromClaim
      ? stableClaimPick.slice(0, maxFromClaim)
      : [...stableClaimPick, ...fallbackClaimPick].slice(0, maxFromClaim);

    const growthPick: string[] = [];
    for (const g of growthBullets) {
      if (growthPick.length >= maxFromGrowth) break;
      addUnique(growthPick, g);
    }

    const combined = [...pickClaim, ...growthPick];
    // 若总条数过少，用 claims 继续补齐（更稳定），避免出现“长期画像块因抽取失败而突然为空”的情况
    if (combined.length < 3 && claimCandidates.length > 0) {
      for (const c of claimCandidates) {
        if (combined.length >= maxBullets) break;
        addUnique(combined as string[], c.content);
      }
    }

    const final = combined.slice(0, maxBullets).filter((b) => b.trim().length > 0);
    if (final.length === 0) return '';

    return ['[长期画像摘要]', ...final.map((b) => `- ${b}`)].join('\n');
  }

  /**
   * 社会互动摘要：用 3 条 bullets 把原本多块 social/relationship pieces 收敛成一个 summary block。
   */
  private buildSocialContextSummaryPart(input: {
    sharedExperiences?: SharedExperienceRecord[];
    rhythmObservations?: string[];
    socialEntities?: SocialEntityRecord[];
    socialInsights?: SocialInsightRecord[];
    socialRelationSignals?: RelevantSocialRelationEdgeRecord[];
  }): string {
    const maxBullets = 3;
    const bullets: string[] = [];
    const seen = new Set<string>();
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const add = (b: string) => {
      const t = b.trim();
      if (!t) return;
      const key = normalize(t);
      if (seen.has(key)) return;
      seen.add(key);
      bullets.push(t.replace(/\s+/g, ' '));
    };

    const relation = input.socialRelationSignals?.[0];
    if (relation) {
      const entityName = relation.entityName?.trim();
      const trend = relation.trend?.toString().trim();
      const qualityNum = typeof relation.quality === 'number' ? relation.quality : Number(relation.quality);
      if (entityName && trend && Number.isFinite(qualityNum)) {
        const note = relation.notes?.trim();
        const notePart = note ? ` | note=${note.slice(0, 40)}` : '';
        add(
          `关键关系：${entityName}（trend=${trend}，quality=${qualityNum.toFixed(2)})${notePart}`,
        );
      }
    } else {
      const entity = input.socialEntities?.[0];
      const name = entity?.name?.trim();
      if (name) {
        const desc = entity?.description?.trim();
        const descPart = desc ? ` | ${desc.slice(0, 40)}` : '';
        add(`关注的人物：${name}${descPart}`);
      }
    }

    const insight = input.socialInsights?.[0];
    const insightText = insight?.content?.trim();
    if (insightText) {
      add(`社会洞察：${insightText.slice(0, 80)}`);
    } else {
      const shared = input.sharedExperiences?.[0];
      const title = shared?.title?.trim();
      if (title) {
        const summary = shared?.summary?.trim();
        const summaryPart = summary ? ` | ${summary.slice(0, 80)}` : '';
        add(`共同背景：${title}${summaryPart}`);
      }
    }

    const rhythm = input.rhythmObservations?.[0];
    const rhythmText = rhythm?.trim();
    if (rhythmText) {
      add(`互动节奏：${rhythmText.slice(0, 80)}`);
    }

    if (bullets.length === 0) return '';
    return ['[社会互动摘要]', ...bullets.slice(0, maxBullets).map((b) => `- ${b}`)].join('\n');
  }

  buildCognitivePolicy(state?: CognitiveTurnState): string {
    if (!state) return '';

    const safetyLine = state.safety.notes.length
      ? `- safety: ${state.safety.notes.join('; ')}`
      : '';

    const lines = [
      '[当前认知决策]',
      `- situation: ${state.situation.kind} (${state.situation.summary})`,
      `- emotion: ${state.userState.emotion}, fragility: ${state.userState.fragility}`,
      `- strategy: ${state.responseStrategy.primaryMode}, depth=${state.responseStrategy.depth}, initiative=${state.responseStrategy.initiative}`,
      `- rhythm: pacing=${state.rhythm.pacing}, askFollowup=${state.rhythm.shouldAskFollowup}, initiative=${state.rhythm.initiative}`,
      `- affinity: mode=${state.affinity.mode}, allowLightTease=${state.affinity.allowLightTease}`,
      safetyLine,
    ].filter(Boolean);

    // 情绪场景 / 高脆弱度：硬降级，确保模型不会进入分析/追问/推进模式
    if (
      state.situation.kind === 'emotional_expression'
      || state.situation.kind === 'relationship_distress'
      || state.userState.fragility === 'high'
    ) {
      lines.push('- 硬约束: 不分析、不追问、不推进。先接住，再等她。');
    }

    return lines.join('\n');
  }

  buildGrowthPolicy(growth?: PersistedGrowthContext): string {
    if (!growth) return '';
    const lines: string[] = [];
    const profileItems = this.uniqueLines(growth.cognitiveProfiles, 3);
    const judgmentItems = this.uniqueLines(growth.judgmentPatterns, 3);
    const valueItems = this.uniqueLines(growth.valuePriorities, 3);
    const rhythmItems = this.uniqueLines(growth.rhythmPatterns, 3);
    const relationshipItems = this.uniqueLines(growth.relationshipNotes, 2);
    const boundaryItems = this.uniqueLines(growth.boundaryNotes, 2);

    if (profileItems.length > 0) {
      lines.push('[长期认知画像]');
      lines.push(...profileItems.map((item) => `- ${item}`));
    }
    if (judgmentItems.length > 0) {
      lines.push('[判断模式]');
      lines.push(...judgmentItems.map((item) => `- ${item}`));
    }
    if (valueItems.length > 0) {
      lines.push('[价值排序]');
      lines.push(...valueItems.map((item) => `- ${item}`));
    }
    if (rhythmItems.length > 0) {
      lines.push('[关系节奏]');
      lines.push(...rhythmItems.map((item) => `- ${item}`));
    }
    if (relationshipItems.length > 0) {
      lines.push('[关系状态]');
      lines.push(...relationshipItems.map((item) => `- ${item}`));
    }
    if (boundaryItems.length > 0) {
      lines.push('[边界提醒]');
      lines.push(...boundaryItems.map((item) => `- ${item}`));
    }

    return lines.join('\n');
  }

  buildBoundaryPolicy(boundary?: BoundaryPromptContext | null): string {
    if (!boundary?.preflightText) return '';
    return boundary.preflightText;
  }

  buildMetaFilterPolicy(policy?: string | null): string {
    if (!policy?.trim()) return '';
    return `你的隐藏输出约束：\n${policy.trim()}`;
  }

  /**
   * 构建表达策略段落（expressionRules）。
   * 放在 system prompt 末尾、紧邻对话历史，确保模型对输出约束的遵从度最高。
   */
  buildExpressionPolicy(
    fields?: ExpressionFields,
    expressionControl?: ExpressionControlState,
  ): string {
    const lines: string[] = [];

    if (fields?.expressionRules) {
      lines.push('你的表达纪律：', fields.expressionRules);
      lines.push('当结构化表达更清晰时，可使用标准 Markdown（标题、列表、引用、代码块、链接、粗斜体）；普通闲聊保持自然文本，不要为了格式而格式化。');
    }

    if (expressionControl) {
      const tuningLines: string[] = [];
      if (expressionControl.warmth <= 0.4) tuningLines.push('- 当前互动保持克制温度，不刻意暖');
      else if (expressionControl.warmth >= 0.65) tuningLines.push('- 当前互动可以多一些温热感');
      if (expressionControl.directness >= 0.65) tuningLines.push('- 与ta说话可以直接，少铺垫');
      else if (expressionControl.directness <= 0.4) tuningLines.push('- 与ta说话适当保留柔和过渡');
      if (expressionControl.humor === 'high') tuningLines.push('- 幽默感可以多一些');
      else if (expressionControl.humor === 'low') tuningLines.push('- 幽默感少用，保持平稳');
      if (expressionControl.bondTone === 'close') tuningLines.push('- 关系基调：比较亲近，不用客气');
      else if (expressionControl.bondTone === 'playful') tuningLines.push('- 关系基调：轻松，可以小打小闹');
      else if (expressionControl.bondTone === 'professional') tuningLines.push('- 关系基调：保持专业感');

      if (tuningLines.length > 0) {
        lines.push('[互动调谐]', ...tuningLines);
      }

      const controlLines: string[] = [];

      // replyMode：决定本轮回复的优先序
      if (expressionControl.replyMode === 'empathy_first') {
        controlLines.push('- 先接住情绪，把认可放在前面，方案或结论放后');
      } else if (expressionControl.replyMode === 'solution_first') {
        controlLines.push('- 直接给方案或结论，情绪部分点到即止');
      } else if (expressionControl.replyMode === 'question') {
        controlLines.push('- 以问题引导为主，帮ta厘清需要什么');
      }
      // acknowledge 和 tool_result 是默认/工具路径，不需要额外提示

      if (expressionControl.pacing === 'slow_gentle') {
        controlLines.push('- 这轮节奏放慢一点，轻一点，允许停在自然节点');
      } else if (expressionControl.pacing === 'direct_quick') {
        controlLines.push('- 这轮节奏更利落，先给结论，少绕弯');
      }

      if (expressionControl.followupDepth === 'none') {
        controlLines.push('- 这轮不主动追问，把空间留给她');
      } else if (expressionControl.followupDepth === 'deep') {
        controlLines.push('- 若需要继续展开，可以适度深入一层，但不要像审问');
      }

      if (expressionControl.verbosity === 'minimal') {
        controlLines.push('- 回复长度偏短，够用就收');
      } else if (expressionControl.verbosity === 'elaborated') {
        controlLines.push('- 信息可以稍展开一点，但仍要保持自然');
      }

      if (expressionControl.boundaryLevel === 'cautious') {
        controlLines.push('- 这轮边界感更谨慎，避免过度代入或替她下定义');
      } else if (expressionControl.boundaryLevel === 'restricted') {
        controlLines.push('- 这轮严格收边界：先接住，不分析，不推进');
      }

      if (controlLines.length > 0) {
        lines.push('[本轮表达控制]', ...controlLines);
      }
    }

    return lines.join('\n');
  }

  private uniqueLines(items: string[], limit: number): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const raw of items) {
      const item = raw?.trim();
      if (!item) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
      if (result.length >= limit) break;
    }

    return result;
  }


  /**
   * LLM 精排：对预筛后的候选记忆按相关性排序。
   */
  async rankMemoriesByRelevance(ctx: {
    recentMessages: Array<{ role: string; content: string }>;
    candidates: MemoryCandidate[];
    tokenBudget: number;
  }): Promise<{ rankedIds: string[]; needDetail: boolean }> {
    const contextText = ctx.recentMessages
      .slice(-3)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const candidateList = ctx.candidates
      .map((c, i) => `${i + 1}. [id=${c.id}] [${c.type}] ${c.content.slice(0, 200)}`)
      .join('\n');

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `[${RANK_PROMPT_VERSION}] 你是记忆检索助手。根据当前对话内容，从候选记忆中选出最相关的若干条，按相关性从高到低排序。同时判断是否需要补充用户的详细历史背景。
只输出 JSON，格式为：{"rankedIds": ["id1", "id2", ...], "needDetail": false}
- rankedIds: 只包含与当前对话相关的记忆 id，不相关的不包含
- needDetail: 当前话题是否需要用户详细历史背景（true/false）`,
      },
      {
        role: 'user',
        content: `当前对话：\n${contextText}\n\n候选记忆：\n${candidateList}`,
      },
    ];

    try {
      const raw = await this.llm.generate(messages, { scenario: 'reasoning' });
      const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr) as { rankedIds?: unknown; needDetail?: unknown };
      return {
        rankedIds: Array.isArray(parsed.rankedIds) ? (parsed.rankedIds as string[]) : [],
        needDetail: !!parsed.needDetail,
      };
    } catch {
      return { rankedIds: ctx.candidates.map((c) => c.id), needDetail: false };
    }
  }

  /**
   * Budget-aware 注入选择：按排序逐条累加直到超出 token 预算。
   */
  selectMemoriesForInjection(
    rankedCandidates: MemoryCandidate[],
    tokenBudget: number,
    contentMaxChars: number = 300,
    useShortSummary: boolean = false,
  ): Array<{ id: string; type: string; content: string }> {
    const result: Array<{ id: string; type: string; content: string }> = [];
    let usedTokens = 0;

    for (const m of rankedCandidates) {
      let text: string;
      if (useShortSummary && m.shortSummary) {
        text = m.shortSummary;
      } else {
        text =
          m.content.length > contentMaxChars
            ? m.content.slice(0, contentMaxChars) + '…'
            : m.content;
      }

      const t = estimateTokens(text);
      if (usedTokens + t > tokenBudget) {
        if (result.length === 0) {
          result.push({ id: m.id, type: m.type, content: text });
        }
        break;
      }
      result.push({ id: m.id, type: m.type, content: text });
      usedTokens += t;
    }

    return result;
  }

  /**
   * Phase3: 总结时同时输出人格微调建议（可选）。
   */
  buildSummaryMessages(ctx: SummaryContext & { personaText?: string }): OpenAI.Chat.ChatCompletionMessageParam[] {
    const dialogue = ctx.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    let personaHint = '';
    if (ctx.personaText) {
      personaHint = `\n\n当前人格描述（供参考）：\n${ctx.personaText}\n\n如果对话中体现了值得微调人格的线索，请在最后额外输出一行：\n- [persona] 人格微调建议（一句话）\n若无需调整则不输出 [persona] 行。`;
    }

    const system: OpenAI.Chat.ChatCompletionMessageParam = {
      role: 'system',
      content: `[${SUMMARY_PROMPT_VERSION}] 根据以下对话，抽取「未来仍有价值的判断」，输出为抽象描述。不要复述对话，每条一行。

格式：- [类型:分类] 内容
可用类型：mid（阶段性） | long（长期）
可用分类：
- shared_fact: 双方已明确达成的共识事实（不带情绪，长期有效）
- commitment: 未来指向但不强制执行的约定（如"下周再讨论"）
- correction: 用户指出的理解错误与正确方向（简要记录纠正点）
- soft_preference: 从对话中归纳的表达/交互偏好（非标签）
- general: 其他有价值的判断（默认）

示例：
- [long:shared_fact] 用户正在构建本地 AI 系统
- [mid:commitment] 用户说看完书再来讨论
- [long:correction] 用户不喜欢被用"您"称呼，应使用"你"
- [long:soft_preference] 偏好结构化分析而非基础科普

规则：
- 不确定的内容不要写入
- 一次性事实不写入 long
- 纠错必须写入 correction
- 分类可省略，省略时默认为 general
若没有可抽取的，回复：无${personaHint}`,
    };
    const user: OpenAI.Chat.ChatCompletionMessageParam = {
      role: 'user',
      content: `对话：\n${dialogue}`,
    };
    return [system, user];
  }

  /**
   * 小晴记忆分析引擎：从对话中抽取结构性长期认知（判断模式 / 价值排序 / 关系节奏），
   * 输出严格 JSON。可选传入已有长期认知，由模型判似并输出 mergeTargetId。
   */
  buildMemoryAnalysisMessages(
    ctx: SummaryContext & {
      existingCognitive?: ExistingCognitiveMemory[];
    },
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const dialogue = ctx.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    let existingBlock = '';
    if (ctx.existingCognitive?.length) {
      existingBlock = `\n\n【已有长期认知】以下为当前已存储的长期认知，若本次抽取的某条与其中某条语义高度相似（相似度 > 0.85），则不要新增该条，改为在该条 update 中填写对应的 mergeTargetId（即下方 id），后端将只增加该条的置信度。\n${ctx.existingCognitive.map((m) => `- id=${m.id}: ${m.content}`).join('\n')}`;
    }

    const keyWhitelist = [
      '【Key 白名单（必须严格匹配，不可自造）】',
      '',
      'jp.*（judgment_pattern）:',
      `- ${CLAIM_KEYS.JP_AFTER_POSITIVE_ADD_NEGATIVE}`,
      `- ${CLAIM_KEYS.JP_QUIT_WHEN_BLOCKED}`,
      `- ${CLAIM_KEYS.JP_NEED_CLEAR_GOAL}`,
      `- ${CLAIM_KEYS.JP_OVER_OPTIMIZE_RISK}`,
      `- ${CLAIM_KEYS.JP_SEEKS_STRUCTURED_PLAN}`,
      `- ${CLAIM_KEYS.JP_LOW_TOLERANCE_FRAGMENT_LEARNING}`,
      '',
      'vp.*（value_priority）:',
      `- ${CLAIM_KEYS.VP_MAINTAINABILITY_OVER_SPEED}`,
      `- ${CLAIM_KEYS.VP_PERFORMANCE_SENSITIVE}`,
      `- ${CLAIM_KEYS.VP_PRAGMATIC_COST_SENSITIVE}`,
      `- ${CLAIM_KEYS.VP_CONSISTENCY_OVER_VARIETY}`,
      `- ${CLAIM_KEYS.VP_LONG_TERM_INVESTMENT}`,
      '',
      'rr.*（relation_rhythm）:',
      `- ${CLAIM_KEYS.RR_PREFER_GENTLE_DIRECT}`,
      `- ${CLAIM_KEYS.RR_PREFER_SHORT_REPLY}`,
      `- ${CLAIM_KEYS.RR_DISLIKE_TOO_PUSHY}`,
      `- ${CLAIM_KEYS.RR_PREFER_COMPANION_MODE_WHEN_TIRED}`,
      `- ${CLAIM_KEYS.RR_ALLOW_PLAYFUL_TEASE_LOW}`,
      '',
      'ip.*（interaction_preference）:',
      `- ${CLAIM_KEYS.IP_ANSWER_FIRST}`,
      `- ${CLAIM_KEYS.IP_USE_BULLETS}`,
      `- ${CLAIM_KEYS.IP_ASK_FEWER_QUESTIONS}`,
      `- ${CLAIM_KEYS.IP_PROVIDE_OPTIONS_COUNT}`,
      `- ${CLAIM_KEYS.IP_TONE_GENTLE}`,
      `- ${CLAIM_KEYS.IP_TONE_CUTE}`,
      `- ${CLAIM_KEYS.IP_TONE_CALM}`,
      `- ${CLAIM_KEYS.IP_TONE_NO_SARCASM}`,
      `- ${CLAIM_KEYS.IP_PRAISE_FREQUENCY}`,
      `- ${CLAIM_KEYS.IP_PRAISE_STYLE}`,
      `- ${CLAIM_KEYS.IP_PRAISE_AVOID}`,
      `- ${CLAIM_KEYS.IP_REPLY_LENGTH}`,
      `- ${CLAIM_KEYS.IP_REPLY_PACE}`,
      `- ${CLAIM_KEYS.IP_REPLY_ENERGY_MATCH}`,
      '',
      'et.*（emotional_tendency）:',
      `- ${CLAIM_KEYS.ET_FRUSTRATION_QUIT_RISK}`,
      `- ${CLAIM_KEYS.ET_NEEDS_VALIDATION_WHEN_UNCERTAIN}`,
      `- ${CLAIM_KEYS.ET_ANXIETY_ABOUT_JOB_SEARCH}`,
      `- ${CLAIM_KEYS.ET_TIRED_AVOID_COMPLEXITY}`,
      `- ${CLAIM_KEYS.ET_PREFERS_STABILITY}`,
      '',
      'memory-only categories（写入 Memory，不写 Claim）:',
      '- shared_fact: 双方已经明确确认、后续仍成立的事实',
      '- commitment: 用户明确说过会做、要记住或之后再处理的约定与计划',
      '- soft_preference: 生活习惯、口味、内容偏好等非互动风格偏好',
      '',
      `（支持的 key 前缀：${ClaimSchemaRegistry.allowedPrefixes.join(' ')}）`,
    ].join('\n');

    const schemaHints = [
      '【valueJson Schema 约束（必须匹配；memory-only categories 可省略 key/valueJson）】',
      '- level: {"level":"low"|"mid"|"high"}',
      '- priority: {"priority":"low"|"mid"|"high"}',
      '- enabled: {"enabled":true|false}',
      '- options count: {"n":1|2|3}',
      '- reply length: {"target":"short"|"medium"|"long"}',
      '- reply pace: {"target":"slow"|"normal"|"fast"}',
      '- praise.style: {"kind":"specific"|"warm"|"playful"|"cute"}',
      '- praise.avoid: {"kind":"generic"|"excessive"|"backhanded"|"appearance"|"money"}',
      '',
      '【Draft Key 规则（当且仅当你要提出“新候选 key”时使用）】',
      '- 先尝试映射到 canonical 白名单 key，只有在你判断无法可靠映射时才输出 draft.*',
      '- 每条 update 必须输出 mappingConfidence（0~1）：表示你对“映射到 canonical”的把握',
      '- 如果你的 key 不在上面的 canonical 白名单里，必须使用 draft 前缀：draft.(ip|jp|vp|rr|et).*',
      '- draft key 长度必须 ≤ 40，且只能使用字母数字与 . _ -',
      '- draft 的 valueJson 必须落在通用形态之一：{level} | {priority} | {enabled} | {target} | {n} | {kind}',
    ].join('\n');

    const system: OpenAI.Chat.ChatCompletionMessageParam = {
      role: 'system',
      content: `[${MEMORY_ANALYSIS_PROMPT_VERSION}] 你是「小晴」的记忆分析引擎，不是聊天助手。你的任务是从对话中提取「结构性长期认知」，而不是记录具体事件。

你必须遵守以下原则：
1. 不记录一次性事件
2. 不记录短期情绪波动
3. 不记录表面事实
4. 只记录具有重复概率的「判断模式」
5. 优先抽取用户的：决策方式、犹豫模式、情绪触发点、价值排序、自我拉扯结构、关系节奏特征
6. 只有在用户表达足够明确时，才提取 shared_fact / commitment / soft_preference 这三类 memory-only 信号

你需要输出八类长期信号（type）：
【A. judgment_pattern】判断模式（key 以 jp. 开头）
【B. value_priority】价值排序（key 以 vp. 开头）
【C. relation_rhythm】关系节奏特征（key 以 rr. 开头）
【D. interaction_preference】交互偏好（key 以 ip. 开头）
【E. emotional_tendency】情绪倾向（key 以 et. 开头）
【F. shared_fact】双方明确确认的事实（memory-only）
【G. commitment】未来承诺、计划、约定（memory-only）
【H. soft_preference】生活/内容偏好（memory-only）

${keyWhitelist}

${schemaHints}

输出格式必须严格为 JSON，且只输出此 JSON，不要 markdown 包裹以外的文字：
{
  "shouldUpdate": true 或 false,
  "updates": [
    {
      "type": "judgment_pattern | value_priority | relation_rhythm | interaction_preference | emotional_tendency | shared_fact | commitment | soft_preference",
      "key": "claim 类别时必须是 canonical 白名单 key；若提出新候选必须用 draft.(ip|jp|vp|rr|et).*；memory-only 类别可省略",
      "valueJson": "claim 类别时必须符合该 key 对应的 schema（见上）；memory-only 类别可省略",
      "content": "可选：一条简短自然语言解释（≤30字）",
      "confidence": 0 到 1 之间的小数,
      "mappingConfidence": 0 到 1 之间的小数（越低越应使用 draft.*）,
      "polarity": "SUPPORT 或 CONTRA（默认为 SUPPORT）",
      "contextTags": ["coding" 等可选场景标签],
      "evidence": {
        "messageId": "来自对话中的 messageId（未知可省略）",
        "snippet": "不超过40字的证据片段",
        "polarity": "SUPPORT | CONTRA | NEUTRAL",
        "weight": 0 到 1.0 之间的小数（可选，默认 1）
      },
      "mergeTargetId": "仅当与已有长期认知或同类记忆语义相似度>0.85时填写，对应已有条目的 id，否则省略此字段"
    }
  ],
  "sessionState": {
    "mood": "calm/happy/low/anxious/irritated/tired/hurt/excited 中之一，可选",
    "energy": "low/medium/high，可选",
    "focus": "low/medium/high，可选",
    "taskIntent": "当前任务意图，可选",
    "confidence": 0 到 1 之间的小数,
    "ttlSeconds": 建议生存时间（秒，建议 3600~21600）
  },
  "doNotStore": ["本次不应记录的内容说明"]
}

如果没有足够重复性或结构性，则 shouldUpdate 为 false，updates 为空数组。宁可少更新，也不要污染长期认知。content 不得超过 30 字。${existingBlock}`,
    };
    const user: OpenAI.Chat.ChatCompletionMessageParam = {
      role: 'user',
      content: `对话：\n${dialogue}`,
    };
    return [system, user];
  }

  /**
   * 工具结果包装：让小晴用自己的语气把执行结果转述给用户。
   */
  buildToolResultMessages(ctx: ToolResultContext): OpenAI.Chat.ChatCompletionMessageParam[] {
    const systemContent = [
      `[${TOOL_WRAP_PROMPT_VERSION}]`,
      ctx.personaText,
      this.buildCollaborationContextPrompt(ctx.collaborationContext),
      this.buildMetaFilterPolicy(ctx.metaFilterPolicy),
      ctx.expressionText ?? '',
      this.buildNicknameHint(ctx.preferredNickname, ctx.expressionControl),
      ctx.userProfileText ?? '',
      '',
      '你刚才帮用户执行了一个任务（通过工具完成），下面是结果。',
      '请用你自己的语气把结果自然地告诉用户。',
      '规则：',
      '- 不要说"工具返回了"、"系统显示"这类话，就像是你自己知道的一样',
      '- 如果工具出错了，委婉地告诉用户你没能完成，可以建议换个方式',
      '- 保持简洁自然',
      '- 【重要】结合对话上下文，根据用户的具体问题有针对性地回答，不要无差别地罗列所有信息。例如用户问"风大吗"就重点说风速体感，问"要带伞吗"就重点说降水，问"冷不冷"就重点说气温。只有用户笼统地问"天气怎么样"才给出完整概况',
      ...(ctx.toolKind === 'timesheet'
        ? [
            '- 工时结果必须保留结构化换行，不要合并成一整段',
            '- 每个项目单独成行，保留并原样传达每项工时数字（h）',
            '- 如果执行结果里已经有列表，优先沿用原列表结构',
          ]
        : []),
    ].join('\n');

    const contextPart = ctx.recentMessages?.length
      ? '近期对话：\n' + ctx.recentMessages
          .map(m => `${m.role === 'user' ? '用户' : '小晴'}：${m.content}`)
          .join('\n') + '\n\n'
      : '';

    const status = ctx.executionStatus ?? (ctx.toolResult ? 'success' : 'failed');
    let resultLabel: string;
    if (status === 'partial_success') {
      resultLabel = '部分执行结果（有内容未完成，以下是已获取的部分）';
    } else if (status === 'timeout') {
      resultLabel = '执行超时，以下是超时前的部分结果（如有）';
    } else if (status === 'failed' || (!ctx.toolResult && status !== 'success')) {
      resultLabel = `执行失败：${ctx.toolError || '未知错误'}`;
    } else {
      resultLabel = '执行结果';
    }

    const userContent = (status === 'failed' && !ctx.toolResult)
      ? `${contextPart}用户说：${ctx.userInput}\n\n${resultLabel}`
      : `${contextPart}用户说：${ctx.userInput}\n\n${resultLabel}：\n${ctx.toolResult ?? ''}`;

    return [
      { role: 'system' as const, content: systemContent },
      { role: 'user' as const, content: userContent },
    ];
  }

  buildCollaborationContextPrompt(ctx?: CollaborationTurnContext | null): string {
    if (!ctx || ctx.mode !== 'inbound_delegation') {
      return '';
    }

    const requesterLabel = ctx.requesterAgentId === 'xiaoqin' ? '小勤' : '小晴';
    const lines = [
      '[协作上下文]',
      `- 当前在处理来自${requesterLabel}的协作线程，不是直接面对终端用户。`,
      '- 对用户原话的理解、意图识别和决策，仍按小晴默认聊天链路进行，不要把协作说明当成用户问题本身。',
      '- 输出应是可供协作 agent 直接转述或继续使用的正文，不要提内部协议、系统设定或“看不到上下文”。',
      `- requestType: ${ctx.requestType}`,
    ];

    if (ctx.summary?.trim()) {
      lines.push(`- 协作摘要：${ctx.summary.trim()}`);
    }
    if (ctx.memoryPolicy?.trim()) {
      lines.push(`- memoryPolicy: ${ctx.memoryPolicy.trim()}`);
    }
    if (ctx.contextExcerpt?.length) {
      lines.push('- 补充上下文：');
      ctx.contextExcerpt.slice(-6).forEach((item, index) => {
        const speaker = item.role === 'user' ? '用户' : requesterLabel;
        lines.push(`  ${index + 1}. ${speaker}：${item.content}`);
      });
    }

    return lines.join('\n');
  }
}
