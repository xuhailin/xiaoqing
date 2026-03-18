import { Injectable } from '@nestjs/common';
import type { EntryAgentId } from '../gateway/message-router.types';
import { PrismaService } from '../infra/prisma.service';
import { estimateTokens } from '../infra/token-estimator';
import type { AgentDelegationKind } from './agent-bus.types';

@Injectable()
export class AgentDelegationProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  async projectReceipt(input: {
    conversationId: string;
    delegationId: string;
    fromAgentId: EntryAgentId;
    toAgentId: EntryAgentId;
    delegationKind: AgentDelegationKind;
    summary?: string | null;
  }) {
    const content = `已转达给${this.getAgentLabel(input.toAgentId)}，我这边继续跟进。`;
    return this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: 'assistant',
        kind: 'agent_receipt',
        content,
        metadata: {
          source: 'system',
          delegationId: input.delegationId,
          fromAgentId: input.fromAgentId,
          toAgentId: input.toAgentId,
          delegationKind: input.delegationKind,
          delegationStatus: 'acknowledged',
          summary: input.summary ?? undefined,
        },
        tokenCount: estimateTokens(content),
      },
    });
  }

  async projectResult(input: {
    conversationId: string;
    delegationId: string;
    fromAgentId: EntryAgentId;
    toAgentId: EntryAgentId;
    delegationKind: AgentDelegationKind;
    success: boolean;
    content: string;
    summary?: string | null;
    relatedMessageId?: string | null;
  }) {
    return this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: 'assistant',
        kind: 'agent_result',
        content: input.content,
        metadata: {
          source: 'assistant',
          delegationId: input.delegationId,
          fromAgentId: input.fromAgentId,
          toAgentId: input.toAgentId,
          delegationKind: input.delegationKind,
          delegationStatus: input.success ? 'completed' : 'failed',
          success: input.success,
          summary: input.summary ?? undefined,
          relatedMessageId: input.relatedMessageId ?? undefined,
        },
        tokenCount: estimateTokens(input.content),
      },
    });
  }

  private getAgentLabel(agentId: EntryAgentId): string {
    return agentId === 'xiaoqin' ? '小勤' : '小晴';
  }
}
