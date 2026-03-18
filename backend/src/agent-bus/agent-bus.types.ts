import type { EntryAgentId } from '../gateway/message-router.types';

export type AgentDelegationKind =
  | 'assist_request'
  | 'memory_proposal'
  | 'capability_fallback';

export type AgentDelegationStatus =
  | 'queued'
  | 'acknowledged'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

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
  schemaVersion: 1;
  requestType: AgentDelegationKind;
  taskIntent?: string;
  slots?: Record<string, unknown>;
  /** 仅作证据与回显，不可作为内部协议的唯一依据 */
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

export interface CreateAgentDelegationInput {
  delegationId?: string;
  originConversationId: string;
  originMessageId?: string;
  requesterAgentId: EntryAgentId;
  executorAgentId: EntryAgentId;
  kind?: AgentDelegationKind;
  title?: string;
  summary?: string;
  payload: AgentDelegationEnvelope;
}

export interface AppendAgentDelegationEventInput {
  delegationId: string;
  actorAgentId: EntryAgentId;
  eventType: AgentDelegationEventType;
  message?: string;
  payload?: Record<string, unknown> | null;
  relatedMessageId?: string;
}

export interface UpdateAgentDelegationStatusInput {
  delegationId: string;
  status: AgentDelegationStatus;
  result?: Record<string, unknown> | null;
  failureReason?: string | null;
  receiptMessageId?: string | null;
  resultMessageId?: string | null;
}
