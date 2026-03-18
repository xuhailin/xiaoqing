import type { AgentDelegationKind, AgentMemoryPolicy } from './agent-bus.types';

export interface AgentInboundDelegationRequest {
  schemaVersion: 1;
  delegationId: string;
  requestType: AgentDelegationKind;
  requester: {
    agentId: string;
    conversationRef: string;
    messageId?: string;
  };
  executor: {
    agentId: string;
  };
  title?: string;
  userFacingSummary?: string;
  taskIntent?: string;
  userInput?: string;
  slots?: Record<string, unknown>;
  contextExcerpt?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  memoryPolicy?: AgentMemoryPolicy;
  responseContract?: {
    mode?: 'sync' | 'async';
    returnViaAgentId: string;
    returnToConversationRef: string;
    sourceMessageId?: string;
  };
  extra?: Record<string, unknown>;
}

export interface AgentMemoryProposal {
  proposalId: string;
  proposerAgentId: string;
  ownerAgentId: string;
  kind: string;
  content: string;
  reason?: string;
  confidence?: number;
  scope?: string;
}

export interface AgentInboundDelegationResult {
  schemaVersion: 1;
  delegationId: string;
  requesterAgentId: string;
  executorAgentId: string;
  status: 'completed' | 'failed';
  summary: string;
  content: string;
  structuredResult: Record<string, unknown> | null;
  memoryProposals: AgentMemoryProposal[];
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
}

/**
 * 从远端返回的原始文本中尝试解析结构化 Delegation Result。
 * 支持两种格式：
 * 1. AGENT_DELEGATION_RESULT_V1\n{...json...}
 * 2. 纯文本（退化为 content）
 */
export function parseDelegationResultFromText(
  rawContent: string,
  delegationId: string,
): { parsed: boolean; result: Partial<AgentInboundDelegationResult>; content: string } {
  const trimmed = rawContent.trim();
  const markerLine = 'AGENT_DELEGATION_RESULT_V1';

  if (!trimmed.startsWith(markerLine)) {
    return { parsed: false, result: {}, content: trimmed };
  }

  const jsonPart = trimmed.slice(markerLine.length).trim();
  try {
    const obj = JSON.parse(jsonPart) as Record<string, unknown>;
    return {
      parsed: true,
      result: {
        schemaVersion: 1,
        delegationId: typeof obj.delegationId === 'string' ? obj.delegationId : delegationId,
        status: obj.status === 'failed' ? 'failed' : 'completed',
        summary: typeof obj.summary === 'string' ? obj.summary : '',
        content: typeof obj.content === 'string' ? obj.content : '',
        structuredResult: isRecord(obj.structuredResult) ? obj.structuredResult : null,
        memoryProposals: Array.isArray(obj.memoryProposals)
          ? (obj.memoryProposals as AgentMemoryProposal[]).filter(
              (p) => !!p && typeof p.content === 'string',
            )
          : [],
        error: isRecord(obj.error)
          ? {
              code: String(obj.error.code ?? 'UNKNOWN'),
              message: String(obj.error.message ?? ''),
              retryable: !!obj.error.retryable,
            }
          : null,
      },
      content: typeof obj.content === 'string' ? obj.content : '',
    };
  } catch {
    return { parsed: false, result: {}, content: trimmed };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

