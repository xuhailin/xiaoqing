import { Injectable } from '@nestjs/common';
import { AgentBusRepository } from './agent-bus.repository';
import type {
  AppendAgentDelegationEventInput,
  CreateAgentDelegationInput,
  UpdateAgentDelegationStatusInput,
} from './agent-bus.types';

@Injectable()
export class AgentBusService {
  constructor(private readonly repo: AgentBusRepository) {}

  async createDelegation(input: CreateAgentDelegationInput) {
    const delegation = await this.repo.createDelegation(input);
    await this.repo.appendEvent({
      delegationId: delegation.id,
      actorAgentId: input.requesterAgentId,
      eventType: 'created',
      message: input.summary ?? input.payload.userFacingSummary ?? 'delegation created',
      payload: {
        kind: input.kind ?? input.payload.requestType,
        executorAgentId: input.executorAgentId,
      },
    });
    return delegation;
  }

  appendEvent(input: AppendAgentDelegationEventInput) {
    return this.repo.appendEvent(input);
  }

  updateStatus(input: UpdateAgentDelegationStatusInput) {
    return this.repo.updateStatus(input);
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  listByConversation(originConversationId: string) {
    return this.repo.listByConversation(originConversationId);
  }
}
