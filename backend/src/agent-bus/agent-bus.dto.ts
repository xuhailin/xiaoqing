import type { EntryAgentId } from '../gateway/message-router.types';
import type {
  AgentDelegationEnvelope,
  AgentDelegationKind,
  AgentMemoryPolicy,
} from './agent-bus.types';

export interface CreateAgentDelegationBody {
  originMessageId?: string;
  parentWorkItemId?: string;
  requesterAgentId: EntryAgentId;
  executorAgentId: EntryAgentId;
  kind?: AgentDelegationKind;
  title?: string;
  summary?: string;
  payload?: Partial<AgentDelegationEnvelope> | null;
  autoDispatch?: boolean;
}

const ENTRY_AGENT_IDS: EntryAgentId[] = ['xiaoqing', 'xiaoqin'];
const DELEGATION_KINDS: AgentDelegationKind[] = [
  'assist_request',
  'memory_proposal',
  'capability_fallback',
];
const MEMORY_POLICIES: AgentMemoryPolicy[] = [
  'main_owner_only',
  'proposal_only',
  'no_memory',
];

export function isEntryAgentId(value: unknown): value is EntryAgentId {
  return typeof value === 'string' && ENTRY_AGENT_IDS.includes(value as EntryAgentId);
}

export function isAgentDelegationKind(value: unknown): value is AgentDelegationKind {
  return typeof value === 'string' && DELEGATION_KINDS.includes(value as AgentDelegationKind);
}

export function isAgentMemoryPolicy(value: unknown): value is AgentMemoryPolicy {
  return typeof value === 'string' && MEMORY_POLICIES.includes(value as AgentMemoryPolicy);
}

export function defaultMemoryPolicyForExecutor(executorAgentId: EntryAgentId): AgentMemoryPolicy {
  return executorAgentId === 'xiaoqin' ? 'proposal_only' : 'main_owner_only';
}
