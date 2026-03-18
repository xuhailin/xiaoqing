import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import type { EntryAgentId } from '../gateway/message-router.types';
import {
  defaultMemoryPolicyForExecutor,
  isAgentDelegationKind,
  isAgentMemoryPolicy,
  isEntryAgentId,
} from './agent-bus.dto';
import type { CreateAgentDelegationBody } from './agent-bus.dto';
import { AgentDelegationExecutorService } from './agent-delegation-executor.service';
import { AgentBusService } from './agent-bus.service';
import type {
  AgentDelegationEnvelope,
  AgentDelegationKind,
  AgentMemoryPolicy,
} from './agent-bus.types';

@Controller('conversations/:conversationId/delegations')
export class AgentBusController {
  constructor(
    private readonly agentBus: AgentBusService,
    private readonly executor: AgentDelegationExecutorService,
  ) {}

  @Post()
  async create(
    @Param('conversationId') conversationId: string,
    @Body() body?: CreateAgentDelegationBody,
  ) {
    if (!body || !isEntryAgentId(body.requesterAgentId) || !isEntryAgentId(body.executorAgentId)) {
      throw new BadRequestException('requesterAgentId and executorAgentId are required');
    }
    if (body.requesterAgentId === body.executorAgentId) {
      throw new BadRequestException('delegation must target a different agent');
    }
    if (body.autoDispatch !== undefined && typeof body.autoDispatch !== 'boolean') {
      throw new BadRequestException('autoDispatch must be boolean when provided');
    }

    const rawPayload = this.resolvePayload(body.payload);
    const kind = this.resolveKind(body.kind, rawPayload.requestType);
    const memoryPolicy = this.resolveMemoryPolicy(
      body.executorAgentId,
      rawPayload.memoryPolicy,
    );
    const normalizedPayload = this.normalizeEnvelope({
      conversationId,
      originMessageId: body.originMessageId,
      requesterAgentId: body.requesterAgentId,
      executorAgentId: body.executorAgentId,
      kind,
      title: body.title,
      summary: body.summary,
      payload: rawPayload,
      memoryPolicy,
    });
    const title = this.normalizeOptionalText(body.title) ?? undefined;
    const summary = this.normalizeOptionalText(body.summary) ?? undefined;

    return this.executor.createDelegationAndDispatch({
      originConversationId: conversationId,
      originMessageId: body.originMessageId,
      requesterAgentId: body.requesterAgentId,
      executorAgentId: body.executorAgentId,
      kind,
      title,
      summary,
      payload: normalizedPayload,
      autoDispatch: body.autoDispatch ?? body.executorAgentId === 'xiaoqin',
    });
  }

  @Get()
  listByConversation(@Param('conversationId') conversationId: string) {
    return this.agentBus.listByConversation(conversationId);
  }

  @Get(':delegationId')
  async findById(
    @Param('conversationId') conversationId: string,
    @Param('delegationId') delegationId: string,
  ) {
    const delegation = await this.agentBus.findById(delegationId);
    if (!delegation || delegation.originConversationId !== conversationId) {
      throw new NotFoundException('delegation not found');
    }
    return delegation;
  }

  private resolvePayload(payload: CreateAgentDelegationBody['payload']): Partial<AgentDelegationEnvelope> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    return payload;
  }

  private resolveKind(
    kind: CreateAgentDelegationBody['kind'],
    payloadKind: Partial<AgentDelegationEnvelope>['requestType'],
  ): AgentDelegationKind {
    const resolvedKind = kind ?? payloadKind;
    if (!isAgentDelegationKind(resolvedKind)) {
      throw new BadRequestException('kind is required and must be a supported delegation kind');
    }
    return resolvedKind;
  }

  private resolveMemoryPolicy(
    executorAgentId: EntryAgentId,
    requestedPolicy: Partial<AgentDelegationEnvelope>['memoryPolicy'],
  ): AgentMemoryPolicy {
    if (requestedPolicy === undefined || requestedPolicy === null) {
      return defaultMemoryPolicyForExecutor(executorAgentId);
    }
    if (!isAgentMemoryPolicy(requestedPolicy)) {
      throw new BadRequestException('memoryPolicy is invalid');
    }
    if (executorAgentId === 'xiaoqin' && requestedPolicy === 'main_owner_only') {
      throw new BadRequestException('xiaoqin cannot receive main_owner_only memory policy');
    }
    return requestedPolicy;
  }

  private normalizeEnvelope(input: {
    conversationId: string;
    originMessageId?: string;
    requesterAgentId: EntryAgentId;
    executorAgentId: EntryAgentId;
    kind: AgentDelegationKind;
    title?: string;
    summary?: string;
    payload: Partial<AgentDelegationEnvelope>;
    memoryPolicy: AgentMemoryPolicy;
  }): AgentDelegationEnvelope {
    const taskIntent = this.normalizeOptionalText(input.payload.taskIntent);
    const slots = this.normalizeRecord(input.payload.slots);
    const userInput = this.normalizeOptionalText(input.payload.userInput);
    const userFacingSummary = this.normalizeOptionalText(input.summary)
      ?? this.normalizeOptionalText(input.payload.userFacingSummary)
      ?? this.normalizeOptionalText(input.title);
    const contextExcerpt = this.normalizeContextExcerpt(input.payload.contextExcerpt);
    const extra = this.normalizeRecord(input.payload.extra);

    return {
      schemaVersion: 1,
      requestType: input.kind,
      ...(taskIntent ? { taskIntent } : {}),
      ...(slots ? { slots } : {}),
      ...(userInput ? { userInput } : {}),
      ...(userFacingSummary ? { userFacingSummary } : {}),
      ...(contextExcerpt ? { contextExcerpt } : {}),
      memoryPolicy: input.memoryPolicy,
      responseContract: {
        returnToConversationId: input.conversationId,
        returnViaAgentId: input.requesterAgentId,
        ...(input.originMessageId ? { sourceMessageId: input.originMessageId } : {}),
      },
      ...(extra ? { extra } : {}),
    };
  }

  private normalizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private normalizeRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private normalizeContextExcerpt(
    value: Partial<AgentDelegationEnvelope>['contextExcerpt'],
  ): Array<{ role: 'user' | 'assistant'; content: string }> | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const normalized = value
      .filter(
        (item): item is { role: 'user' | 'assistant'; content: string } =>
          !!item
          && (item.role === 'user' || item.role === 'assistant')
          && typeof item.content === 'string',
      )
      .map((item) => ({
        role: item.role,
        content: item.content.trim().slice(0, 1200),
      }))
      .filter((item) => item.content.length > 0)
      .slice(-8);

    return normalized.length > 0 ? normalized : null;
  }
}
