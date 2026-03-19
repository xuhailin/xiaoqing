import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
} from '@nestjs/common';
import { AgentInboundAuthService } from './agent-inbound-auth.service';
import { AgentInboundDelegationService } from './agent-inbound-delegation.service';
import { AgentInboundResultService } from './agent-inbound-result.service';
import type {
  AgentInboundDelegationRequest,
  AgentInboundDelegationResult,
} from './agent-bus.protocol';

@Controller('agent-bus/inbound')
export class AgentInboundController {
  constructor(
    private readonly auth: AgentInboundAuthService,
    private readonly inboundDelegation: AgentInboundDelegationService,
    private readonly inboundResult: AgentInboundResultService,
  ) {}

  @Get('health')
  health() {
    return {
      ok: true,
      agentId: 'xiaoqing',
      protocol: 'agent-bus-inbound-v1',
      capabilities: ['delegations', 'results'],
    };
  }

  @Post('delegations')
  async receiveDelegation(
    @Headers('authorization') authorization?: string,
    @Body() body?: AgentInboundDelegationRequest | { message?: string; timeoutSeconds?: number },
  ) {
    const normalized = this.normalizeDelegationBody(body);
    if (!normalized?.requester?.agentId) {
      throw new BadRequestException('requester.agentId is required');
    }
    this.auth.authenticateOrThrow(normalized.requester.agentId ?? '', authorization);
    return this.inboundDelegation.handleInboundDelegation(normalized);
  }

  @Post('results')
  async receiveResult(
    @Headers('authorization') authorization?: string,
    @Body() body?: AgentInboundDelegationResult,
  ) {
    const callerAgentId = body?.executorAgentId;
    if (!callerAgentId) {
      throw new BadRequestException('executorAgentId is required');
    }
    this.auth.authenticateOrThrow(callerAgentId, authorization);
    return this.inboundResult.handleInboundResult(
      body as AgentInboundDelegationResult,
      callerAgentId,
    );
  }

  private normalizeDelegationBody(
    body?: AgentInboundDelegationRequest | { message?: string; timeoutSeconds?: number },
  ): AgentInboundDelegationRequest {
    if (!body) {
      throw new BadRequestException('body is required');
    }

    // Compatibility: accept OpenClaw-like payload: { message: "AGENT_DELEGATION_V1\n{...json...}" }
    const maybeMessage = (body as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return this.parseDelegationMessageOrThrow(maybeMessage);
    }

    return body as AgentInboundDelegationRequest;
  }

  private parseDelegationMessageOrThrow(message: string): AgentInboundDelegationRequest {
    const trimmed = message.trim();
    const markerLine = 'AGENT_DELEGATION_V1';
    if (!trimmed.startsWith(markerLine)) {
      throw new BadRequestException(`unsupported message format: must start with ${markerLine}`);
    }

    const jsonPart = trimmed.slice(markerLine.length).trim();
    let obj: any;
    try {
      obj = JSON.parse(jsonPart);
    } catch {
      throw new BadRequestException('invalid delegation message JSON');
    }

    const delegationId = typeof obj?.delegationId === 'string' ? obj.delegationId.trim() : '';
    const requesterAgentId = typeof obj?.requesterAgentId === 'string' ? obj.requesterAgentId.trim() : '';
    const requestType = typeof obj?.kind === 'string' ? obj.kind.trim() : '';
    const payload = obj?.payload && typeof obj.payload === 'object' ? obj.payload : null;

    const conversationRef = String(
      payload?.extra?.requesterConversationRef
        ?? payload?.extra?.returnToConversationRef
        ?? payload?.responseContract?.returnToConversationId
        ?? delegationId
        ?? 'unknown',
    ).trim();

    return {
      schemaVersion: 1,
      delegationId,
      requestType,
      requester: {
        agentId: requesterAgentId,
        conversationRef,
        messageId:
          typeof payload?.responseContract?.sourceMessageId === 'string'
            ? payload.responseContract.sourceMessageId
            : undefined,
      },
      executor: { agentId: 'xiaoqing' },
      title: typeof obj?.title === 'string' ? obj.title : undefined,
      userFacingSummary:
        typeof obj?.summary === 'string'
          ? obj.summary
          : typeof payload?.userFacingSummary === 'string'
            ? payload.userFacingSummary
            : undefined,
      taskIntent: typeof payload?.taskIntent === 'string' ? payload.taskIntent : undefined,
      userInput: typeof payload?.userInput === 'string' ? payload.userInput : undefined,
      slots: payload?.slots && typeof payload.slots === 'object' ? payload.slots : undefined,
      contextExcerpt: Array.isArray(payload?.contextExcerpt) ? payload.contextExcerpt : undefined,
      memoryPolicy: payload?.memoryPolicy,
      responseContract: {
        mode: payload?.responseContract?.mode,
        returnViaAgentId: requesterAgentId,
        returnToConversationRef: conversationRef,
        ...(typeof payload?.responseContract?.sourceMessageId === 'string'
          ? { sourceMessageId: payload.responseContract.sourceMessageId }
          : {}),
      },
      extra: payload?.extra && typeof payload.extra === 'object' ? payload.extra : undefined,
    } as AgentInboundDelegationRequest;
  }
}
