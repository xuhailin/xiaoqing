import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export type MessageContentType = 'text' | 'markdown';

export interface Message {
  id: string;
  role: string;
  content: string;
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
  summarizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
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

  getOrCreateCurrent() {
    return this.http.get<{ id: string }>(`${this.base}/current`);
  }

  create() {
    return this.http.post<{ id: string }>(this.base, {});
  }

  getMessages(conversationId: string) {
    return this.http.get<Message[]>(`${this.base}/${conversationId}/messages`);
  }

  /** 获取该会话的默认世界状态（地点/时区/语言等），用于侧栏或聊天页展示 */
  getWorldState(conversationId: string) {
    return this.http.get<WorldState | null>(`${this.base}/${conversationId}/world-state`);
  }

  sendMessage(conversationId: string, content: string) {
    return this.http.post<SendMessageResponse>(
      `${this.base}/${conversationId}/messages`,
      { content },
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
