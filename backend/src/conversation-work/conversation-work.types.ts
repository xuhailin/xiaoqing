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

export type ConversationWorkProjectionType = 'receipt' | 'result';

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
  createdAt: Date;
  updatedAt: Date;
}
