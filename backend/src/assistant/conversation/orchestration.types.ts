import type { PersonaDto, ExpressionFields } from '../persona/persona.service';
import type { UserProfileDto } from '../persona/user-profile.service';
import type { AnchorDto } from '../identity-anchor/identity-anchor.service';
import type { TraceStep } from '../../infra/trace/trace.types';
import type {
  BoundaryPromptContext,
  ClaimSignal,
  CognitiveTurnState,
  EmotionTrendSummary,
  PersistedGrowthContext,
  SessionStateSignal,
} from '../cognitive-pipeline/cognitive-pipeline.types';
import type { ActionDecision } from '../action-reasoner/action-reasoner.types';
import type { DialogueIntentState } from '../intent/intent.types';
import type { WorldState } from '../../infra/world-state/world-state.types';
import type {
  DailyMomentRecord,
} from '../life-record/daily-moment/daily-moment.types';
import type { LocalSkillRunResult } from '../../action/local-skills/local-skill.types';
import type { SystemSelf } from '../../system-self/system-self.types';
import type { PostTurnPlan } from '../post-turn/post-turn.types';
import type { SharedExperienceRecord } from '../shared-experience/shared-experience.types';
import type { SocialEntityRecord } from '../life-record/social-entity/social-entity.types';
import type { SocialInsightRecord } from '../life-record/social-insight/social-insight.types';
import type { RelevantSocialRelationEdgeRecord } from '../life-record/social-relation-edge/social-relation-edge.types';
import type { EntryAgentId } from '../../gateway/message-router.types';
import type {
  ConversationWorkItemDto,
  ConversationWorkProjectionType,
  ConversationWorkStatus,
} from '../../conversation-work/conversation-work.types';
import type { DialogueTargetKind } from '../intent/intent.types';
import type { QuickRouterOutput } from './quick-intent-router.types';

export type MessageContentType = 'text' | 'markdown';
export type ConversationMessageKind =
  | 'user'
  | 'chat'
  | 'tool'
  | 'agent_receipt'
  | 'agent_result'
  | 'reminder_created'
  | 'reminder_list'
  | 'reminder_cancelled'
  | 'reminder_triggered'
  | 'system'
  | 'daily_moment';

export interface ConversationMessageMetadata {
  source?: 'assistant' | 'tool' | 'scheduler' | 'system' | 'daily-moment';
  toolKind?: string;
  toolName?: string;
  success?: boolean;
  summary?: string;
  delegationId?: string;
  fromAgentId?: 'xiaoqing' | 'xiaoqin';
  toAgentId?: 'xiaoqing' | 'xiaoqin';
  delegationStatus?: string;
  delegationKind?: string;
  relatedMessageId?: string;
  reminderAction?: 'create' | 'list' | 'cancel' | 'trigger';
  reminderId?: string;
  reminderReason?: string;
  scheduleText?: string;
  nextRunAt?: string;
  count?: number;
  triggerMode?: string;
  workItemId?: string;
  workProjection?: ConversationWorkProjectionType;
  workStatus?: ConversationWorkStatus;
  captureKind?: Exclude<DialogueTargetKind, 'chat' | 'task'>;
  ideaId?: string;
  todoId?: string;
  planId?: string;
}

export interface ConversationMessageDto {
  id: string;
  role: string;
  kind: ConversationMessageKind;
  content: string;
  metadata: ConversationMessageMetadata | null;
  contentType: MessageContentType;
  createdAt: Date;
}

/**
 * 从 pa.* (INTERACTION_TUNING) claims 聚合的长期互动调谐偏好。
 * 表达"面向该用户的互动风格倾向"，与 persona（系统身份）无关。
 */
export interface InteractionTuningSignal {
  key: string;   // e.g. 'pa.warmth', 'pa.directness', 'pa.humor', 'pa.bond_tone'
  value: unknown;
  confidence: number;
}

export interface MemoryRecallPlan {
  strategy?: 'keyword' | 'vector' | 'hybrid';
  candidatesCount: number;
  selectedCount: number;
  needDetail: boolean;
}

export interface CollaborationContextExcerptItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface CollaborationTurnContext {
  mode: 'inbound_delegation';
  requesterAgentId: EntryAgentId;
  executorAgentId: EntryAgentId;
  delegationId: string;
  requestType: string;
  summary?: string | null;
  userInput?: string | null;
  memoryPolicy?: string | null;
  contextExcerpt?: CollaborationContextExcerptItem[] | null;
}

export interface TurnContext {
  request: {
    conversationId: string;
    userId: string;
    now: Date;
    userInput: string;
    userMessage: {
      id: string;
      role: 'user';
      content: string;
      createdAt: Date;
    };
  };
  conversation: {
    recentMessages: Array<{ role: string; content: string }>;
  };
  persona: {
    personaDto: PersonaDto;
    expressionFields: ExpressionFields;
    metaFilterPolicy: string | null;
  };
  user: {
    userProfile: UserProfileDto;
    identityAnchors: AnchorDto[];
    anchorText: string | null;
    anchorCity?: string;
    /** 用户的首选昵称（来自 ip.nickname.primary claim，独立处理，不混入 tuning） */
    preferredNickname?: string | null;
    /** 从 pa.* (INTERACTION_TUNING) claims 聚合的长期互动偏好，由 Assembler 填入 */
    interactionTuning?: InteractionTuningSignal[];
  };
  world: {
    storedWorldState: WorldState | null;
    defaultWorldState: WorldState | null;
    fullWorldState: WorldState | null;
  };
  memory: {
    strategy?: 'keyword' | 'vector' | 'hybrid';
    injectedMemories: Array<{ id: string; type: string; content: string }>;
    candidatesCount: number;
    needDetail: boolean;
    memoryBudgetTokens: number;
  };
  growth: {
    growthContext: PersistedGrowthContext;
  };
  relationship: {
    sharedExperiences: SharedExperienceRecord[];
    rhythmObservations: string[];
  };
  social: {
    entities: SocialEntityRecord[];
    insights: SocialInsightRecord[];
    relationSignals: RelevantSocialRelationEdgeRecord[];
  };
  claims: {
    claimSignals: ClaimSignal[];
    claimPolicyText: string;
    sessionState: SessionStateSignal | null;
    sessionStateText: string;
    injectedClaimsDebug: Array<{ type: string; key: string; confidence: number; status: string }>;
    draftClaimsDebug: Array<{ type: string; key: string; confidence: number; status: string }>;
  };
  system: {
    systemSelf: SystemSelf;
  };
  runtime: {
    /**
     * 原始意图识别结果；过渡期与 PerceptionState.intentState 并存。
     * @deprecated 决策链路请优先通过显式传递的 PerceptionState 读取。
     */
    intentState?: DialogueIntentState | null;
    /**
     * 融合补全后的意图结果；过渡期与 PerceptionState.mergedIntentState 并存。
     * @deprecated 决策链路请优先通过显式传递的 PerceptionState 读取。
     */
    mergedIntentState?: DialogueIntentState | null;
    /** 决策层的唯一主动作输出。 */
    actionDecision?: ActionDecision;
    /** 记忆召回统计，仅供 trace / debug / prompt 策略使用。 */
    memoryRecall?: MemoryRecallPlan;
    /** Agent 协作场景下的入站委托上下文。 */
    collaborationContext?: CollaborationTurnContext | null;
    /**
     * Quick Router 的轻量分流结果；过渡期与 PerceptionState.quickRoute 并存。
     * @deprecated 决策链路请优先通过显式传递的 PerceptionState 读取。
     */
    quickRoute?: QuickRouterOutput | null;
    /**
     * 本回合认知状态；过渡期与 PerceptionState.cognitiveState 并存。
     * @deprecated 新的结构化边界请优先通过显式传递的 PerceptionState 读取。
     */
    cognitiveState?: CognitiveTurnState;
    /**
     * 最近情绪趋势摘要；过渡期与 PerceptionState.emotionTrend 并存。
     * @deprecated 决策链路请优先通过显式传递的 PerceptionState 读取。
     */
    emotionTrend?: EmotionTrendSummary | null;
    /** 表达层边界提示上下文。 */
    boundaryPrompt?: BoundaryPromptContext | null;
    /** 上一轮反思结果，供当前轮表达微调。 */
    previousReflection?: {
      quality: 'good' | 'suboptimal' | 'failed';
      adjustmentHint: string;
      timestamp: Date;
    };
  };
}

export interface SendMessageResult {
  userMessage: ConversationMessageDto;
  assistantMessage: ConversationMessageDto;
  injectedMemories: Array<{ id: string; type: string; content: string }>;
  openclawUsed?: boolean;
  localSkillUsed?: 'weather' | 'book_download' | 'general_action' | 'timesheet' | 'reminder' | 'page_screenshot';
  dailyMoment?: {
    mode: 'entry';
    record?: DailyMomentRecord;
  };
  meta?: {
    localSkillRun?: LocalSkillRunResult;
    workCapture?: {
      kind: Exclude<DialogueTargetKind, 'chat' | 'task'>;
      ideaId?: string;
      todoId?: string;
      planId?: string;
    };
  };
  debugMeta?: Record<string, unknown>;
  trace?: TraceStep[];
  workItems?: ConversationWorkItemDto[];
}

/**
 * ChatCompletionEngine 内部返回的执行产物。
 * 该类型可直接携带已持久化结果，也可以只返回 executionResult 交给 Orchestrator 继续组织回复。
 */
export interface ChatCompletionResult {
  result?: SendMessageResult;
  postTurnPlan?: PostTurnPlan;
  postTurnMeta?: PostTurnBuildMeta;
  executionResult?: ExecutionResult;
}

export interface PostTurnBuildMeta {
  executionPath: 'chat' | 'tool' | 'missing_params';
  intentState?: DialogueIntentState | null;
  cognitiveState?: CognitiveTurnState;
  isImportantIssueInProgress?: boolean;
}

export type ToolKind =
  | 'weather'
  | 'book_download'
  | 'general_action'
  | 'timesheet'
  | 'reminder'
  | 'page_screenshot'
  | 'openclaw';

/**
 * Orchestrator 视角的执行结果。
 *
 * 生产者是 ChatCompletionEngine，消费者是 AssistantOrchestrator.composeExecutionReply。
 * 与引擎层内部的 ChatCompletionResult 不同，这里只描述执行路径与可用于回复组织的结果摘要。
 */
export interface ExecutionResult {
  status: 'success' | 'failed' | 'need_clarification' | 'partial_success' | 'timeout';
  path: 'chat' | 'tool' | 'missing_params';
  /** 面向回复组织层的语义化工具分类，用于选择表达模板。 */
  toolKind?: ToolKind;
  toolResult?: string | null;
  toolError?: string | null;
  toolWasActuallyUsed?: boolean;
  missingParams?: string[];
  openclawUsed?: boolean;
  /** 面向前端/消息元数据的本地技能字面标记，不等价于表达层使用的 toolKind。 */
  localSkillUsed?: 'weather' | 'book_download' | 'general_action' | 'timesheet' | 'reminder' | 'page_screenshot';
  messageKind?: ConversationMessageKind;
  messageMetadata?: ConversationMessageMetadata;
  debugMeta?: Record<string, unknown>;
  trace?: TraceStep[];
}

export type ToolPolicyAction =
  | 'chat'
  | 'ask_missing'
  | 'run_capability'
  | 'run_openclaw';

export interface ToolPolicyDecision {
  action: ToolPolicyAction;
  reason: string;
  capability?: string;
}
