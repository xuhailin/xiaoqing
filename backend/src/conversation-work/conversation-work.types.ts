export type ConversationWorkStatus =
  | 'accepted'
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type ConversationWorkExecutorType =
  | 'dev_run'
  | 'agent_delegation'
  | 'tool_run'
  | 'scheduled_action';

export type ConversationWorkEventType =
  | 'accepted'
  | 'queued'
  | 'started'
  | 'progress'
  | 'waiting_input'
  | 'resumed'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'receipt_projected'
  | 'result_projected';

export type ConversationWorkProjectionType = 'receipt' | 'result' | 'followup';

export type ConversationWorkHealthState =
  | 'normal'
  | 'attention'
  | 'stalled'
  | 'waiting_user'
  | 'timed_out';

export interface ConversationWorkItemDto {
  id: string;
  conversationId: string;
  originUserMessageId: string;
  originReceiptMessageId: string | null;
  resultMessageId: string | null;
  status: ConversationWorkStatus;
  executorType: ConversationWorkExecutorType | null;
  sourceRefId: string | null;
  title: string | null;
  userFacingGoal: string;
  latestSummary: string | null;
  blockReason: string | null;
  waitingQuestion: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  timeoutAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastEventAt: Date | null;
  parentWorkItemId: string | null;
  childCount: number;
  activeChildCount: number;
  healthState: ConversationWorkHealthState;
  healthSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * DevAgent SSE stream payload (in-memory, non-persistent).
   * Only present for DevAgent runs on the same work-item SSE channel.
   */
  devRunStream?: DevRunStream | null;
}

export type DevRunStreamKind = 'progress' | 'final_reply';

export type DevRunStreamPhase = 'plan' | 'execute' | 'evaluate' | 'replan' | 'report';

export interface DevRunStreamProgress {
  kind: 'progress';
  phase: DevRunStreamPhase;
  meta?: Record<string, unknown>;
  at?: string;
}

export interface DevRunStreamFinalReply {
  kind: 'final_reply';
  /**
   * `text` is the full text so far (for progressive rendering on client).
   * For `done=true`, `text` should contain the full final reply.
   */
  text: string;
  chunk?: string;
  done: boolean;
  at?: string;
}

export type DevRunStream = DevRunStreamProgress | DevRunStreamFinalReply;
