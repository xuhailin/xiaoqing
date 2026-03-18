import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export type EntryAgentId = 'xiaoqing' | 'xiaoqin';

export type MessageContentType = 'text' | 'markdown';
export type MessageKind =
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

export interface MessageMetadata {
  source?: 'assistant' | 'tool' | 'scheduler' | 'system' | 'daily-moment';
  toolKind?: string;
  toolName?: string;
  success?: boolean;
  summary?: string;
  delegationId?: string;
  fromAgentId?: EntryAgentId;
  toAgentId?: EntryAgentId;
  delegationStatus?: AgentDelegationStatus;
  delegationKind?: AgentDelegationKind;
  relatedMessageId?: string;
  reminderAction?: 'create' | 'list' | 'cancel' | 'trigger';
  reminderId?: string;
  reminderReason?: string;
  scheduleText?: string;
  nextRunAt?: string;
  count?: number;
  triggerMode?: string;
}

export interface Message {
  id: string;
  role: string;
  kind: MessageKind;
  content: string;
  metadata: MessageMetadata | null;
  contentType?: MessageContentType;
  createdAt: string;
}

export interface InjectedMemory {
  id: string;
  type: string;
  content: string;
}

export interface ConversationItem {
  id: string;
  title: string | null;
  entryAgentId: EntryAgentId;
  summarizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  activeReminderCount: number;
  latestMessage: Message | null;
}

export type AgentDelegationStatus =
  | 'queued'
  | 'acknowledged'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentDelegationKind =
  | 'assist_request'
  | 'memory_proposal'
  | 'capability_fallback';

export type AgentDelegationEventType =
  | 'created'
  | 'acknowledged'
  | 'started'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'receipt_projected'
  | 'result_projected';

export type AgentMemoryPolicy =
  | 'main_owner_only'
  | 'proposal_only'
  | 'no_memory';

export interface AgentDelegationEnvelope {
  schemaVersion?: 1;
  requestType: AgentDelegationKind;
  taskIntent?: string;
  slots?: Record<string, unknown>;
  userInput?: string;
  userFacingSummary?: string;
  contextExcerpt?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  memoryPolicy?: AgentMemoryPolicy;
  responseContract?: {
    returnToConversationId: string;
    returnViaAgentId: EntryAgentId;
    sourceMessageId?: string;
  };
  extra?: Record<string, unknown>;
}

export interface CreateAgentDelegationRequest {
  originMessageId?: string;
  requesterAgentId: EntryAgentId;
  executorAgentId: EntryAgentId;
  kind?: AgentDelegationKind;
  title?: string;
  summary?: string;
  payload: AgentDelegationEnvelope;
  autoDispatch?: boolean;
}

export interface AgentDelegationEvent {
  id: string;
  delegationId: string;
  actorAgentId: EntryAgentId;
  eventType: AgentDelegationEventType;
  message: string | null;
  payloadJson: Record<string, unknown> | null;
  relatedMessageId: string | null;
  createdAt: string;
}

export interface AgentDelegation {
  id: string;
  originConversationId: string;
  originMessageId: string | null;
  requesterAgentId: EntryAgentId;
  executorAgentId: EntryAgentId;
  kind: AgentDelegationKind;
  status: AgentDelegationStatus;
  title: string | null;
  summary: string | null;
  payloadJson: AgentDelegationEnvelope;
  resultJson: Record<string, unknown> | null;
  failureReason: string | null;
  receiptMessageId: string | null;
  resultMessageId: string | null;
  ackedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: AgentDelegationEvent[];
}

/** 当前会话的默认世界状态（地点/时区/语言等），会话级，不写入长期记忆 */
export interface WorldState {
  city?: string;
  timezone?: string;
  language?: string;
  device?: string;
  conversationMode?: string;
}

export interface DebugMeta {
  model?: { provider: string; modelName: string; isMock: boolean };
  context?: {
    historyRounds: number;
    actualMessagesUsed: number;
    estimatedTokens: number;
    maxContextTokens: number;
    truncated: boolean;
  };
  memory?: {
    featureFlags: Record<string, boolean>;
    candidatesCount: number;
    injectedCount: number;
    memoryBudgetTokens: number;
    needDetail: boolean;
  };
  prompt?: {
    version: string;
    systemPromptTokens: number;
    systemPromptPreview?: string;
    messagePreview?: Array<{ role: string; content: string }>;
  };
  pipeline?: {
    currentStep: string;
    events: number;
    firstSeenOrder: string[];
    canonicalOrder: string[];
    canonicalMatchSoFar: boolean;
    strictCanonical: boolean;
  };
}

export type TraceStepStatus = 'success' | 'fail' | 'skip';

export interface TraceStep {
  seq: number;
  label: string;
  title: string;
  durationMs: number;
  status: TraceStepStatus;
  detail: Record<string, unknown>;
}

export interface SendMessageResponse {
  userMessage: Message;
  assistantMessage: Message;
  injectedMemories: InjectedMemory[];
  debugMeta?: DebugMeta;
  openclawUsed?: boolean;
  localSkillUsed?: 'weather' | 'book_download' | 'general_action';
  trace?: TraceStep[];
}

export interface SummarizeResponse {
  created: number;
  memories: Array<{
    id: string;
    type: string;
    category: string;
    content: string;
  }>;
  merged?: number;
  overwritten?: number;
  skipped?: number;
  doNotStore?: string[];
  confidenceBumps?: Array<{ memoryId: string; newConfidence: number }>;
  personaSuggestion?: string;
}

@Injectable({ providedIn: 'root' })
export class ConversationService {
  private base = `${environment.apiUrl}/conversations`;
  private _refreshList$ = new Subject<void>();
  readonly refreshList$ = this._refreshList$.asObservable();

  constructor(private http: HttpClient) {}

  notifyListRefresh() {
    this._refreshList$.next();
  }

  list() {
    return this.http.get<ConversationItem[]>(this.base);
  }

  getOrCreateCurrent(entryAgentId: EntryAgentId = 'xiaoqing') {
    return this.http.get<{ id: string; entryAgentId: EntryAgentId }>(
      `${this.base}/current?entryAgentId=${entryAgentId}`,
    );
  }

  create(entryAgentId: EntryAgentId = 'xiaoqing') {
    return this.http.post<{ id: string; entryAgentId: EntryAgentId }>(this.base, {
      entryAgentId,
    });
  }

  getMessages(conversationId: string) {
    return this.http.get<Message[]>(`${this.base}/${conversationId}/messages`);
  }

  getDelegations(conversationId: string) {
    return this.http.get<AgentDelegation[]>(`${this.base}/${conversationId}/delegations`);
  }

  getDelegation(conversationId: string, delegationId: string) {
    return this.http.get<AgentDelegation>(
      `${this.base}/${conversationId}/delegations/${delegationId}`,
    );
  }

  createDelegation(conversationId: string, request: CreateAgentDelegationRequest) {
    return this.http.post<AgentDelegation>(
      `${this.base}/${conversationId}/delegations`,
      request,
    );
  }

  /** 获取该会话的默认世界状态（地点/时区/语言等），用于侧栏或聊天页展示 */
  getWorldState(conversationId: string) {
    return this.http.get<WorldState | null>(`${this.base}/${conversationId}/world-state`);
  }

  sendMessage(conversationId: string, content: string, entryAgentId?: EntryAgentId) {
    return this.http.post<SendMessageResponse>(
      `${this.base}/${conversationId}/messages`,
      {
        content,
        ...(entryAgentId ? { entryAgentId } : {}),
      },
    );
  }

  delete(conversationId: string) {
    return this.http.delete<{ deletedMemories: number }>(`${this.base}/${conversationId}`);
  }

  summarize(conversationId: string, messageIds?: string[]) {
    return this.http.post<SummarizeResponse>(
      `${this.base}/${conversationId}/summarize`,
      messageIds ? { messageIds } : {},
    );
  }

  /** 切换会话时兜底总结（fire-and-forget） */
  flushSummarize(conversationId: string) {
    return this.http.post<{ flushed: boolean }>(
      `${this.base}/${conversationId}/flush-summarize`,
      {},
    );
  }
}
