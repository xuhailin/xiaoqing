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
    @Body() body?: AgentInboundDelegationRequest,
  ) {
    if (!body?.requester?.agentId) {
      throw new BadRequestException('requester.agentId is required');
    }
    this.auth.authenticateOrThrow(body?.requester?.agentId ?? '', authorization);
    return this.inboundDelegation.handleInboundDelegation(body as AgentInboundDelegationRequest);
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
}
