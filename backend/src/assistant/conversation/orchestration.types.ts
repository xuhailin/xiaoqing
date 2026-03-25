import type { PersonaDto, ExpressionFields } from '../persona/persona.service';
import type { UserProfileDto } from '../persona/user-profile.service';
import type { AnchorDto } from '../identity-anchor/identity-anchor.service';
import type { TraceStep } from '../../infra/trace/trace.types';
import type {
  BoundaryPromptContext,
  ClaimSignal,
  CognitiveTurnState,
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

export interface MemoryRecallPlan {
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
    /** 用户的首选昵称（来自 ip.nickname.primary claim） */
    preferredNickname?: string | null;
  };
  world: {
    storedWorldState: WorldState | null;
    defaultWorldState: WorldState | null;
    fullWorldState: WorldState | null;
  };
  memory: {
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
    intentState?: DialogueIntentState | null;
    mergedIntentState?: DialogueIntentState | null;
    actionDecision?: ActionDecision;
    memoryRecall?: MemoryRecallPlan;
    collaborationContext?: CollaborationTurnContext | null;
    cognitiveState?: CognitiveTurnState;
    boundaryPrompt?: BoundaryPromptContext | null;
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

export interface ChatCompletionResult {
  result: SendMessageResult;
  postTurnPlan?: PostTurnPlan;
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
