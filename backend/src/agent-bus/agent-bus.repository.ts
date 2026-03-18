import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import type {
  AppendAgentDelegationEventInput,
  CreateAgentDelegationInput,
  UpdateAgentDelegationStatusInput,
} from './agent-bus.types';

@Injectable()
export class AgentBusRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDelegation(input: CreateAgentDelegationInput) {
    return this.prisma.agentDelegation.create({
      data: {
        ...(input.delegationId ? { id: input.delegationId } : {}),
        originConversationId: input.originConversationId,
        originMessageId: input.originMessageId ?? null,
        requesterAgentId: input.requesterAgentId,
        executorAgentId: input.executorAgentId,
        kind: input.kind ?? input.payload.requestType,
        title: input.title?.trim() || null,
        summary: input.summary?.trim() || input.payload.userFacingSummary?.trim() || null,
        payloadJson: input.payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async appendEvent(input: AppendAgentDelegationEventInput) {
    return this.prisma.agentDelegationEvent.create({
      data: {
        delegationId: input.delegationId,
        actorAgentId: input.actorAgentId,
        eventType: input.eventType,
        message: input.message?.trim() || null,
        payloadJson: input.payload ? (input.payload as Prisma.InputJsonValue) : Prisma.DbNull,
        relatedMessageId: input.relatedMessageId ?? null,
      },
    });
  }

  async updateStatus(input: UpdateAgentDelegationStatusInput) {
    const now = new Date();
    return this.prisma.agentDelegation.update({
      where: { id: input.delegationId },
      data: {
        status: input.status,
        ...(input.result !== undefined
          ? { resultJson: input.result ? (input.result as Prisma.InputJsonValue) : Prisma.DbNull }
          : {}),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
        ...(input.receiptMessageId !== undefined ? { receiptMessageId: input.receiptMessageId } : {}),
        ...(input.resultMessageId !== undefined ? { resultMessageId: input.resultMessageId } : {}),
        ...(input.status === 'acknowledged' ? { ackedAt: now } : {}),
        ...(input.status === 'running' ? { startedAt: now } : {}),
        ...(
          input.status === 'completed'
          || input.status === 'failed'
          || input.status === 'cancelled'
            ? { finishedAt: now }
            : {}
        ),
      },
    });
  }

  async findById(id: string) {
    return this.prisma.agentDelegation.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async listByConversation(originConversationId: string) {
    return this.prisma.agentDelegation.findMany({
      where: { originConversationId },
      orderBy: { createdAt: 'desc' },
      include: {
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
