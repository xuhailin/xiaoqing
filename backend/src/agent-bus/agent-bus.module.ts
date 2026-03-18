import { Module } from '@nestjs/common';
import { ConversationModule } from '../assistant/conversation/conversation.module';
import { QueueModule } from '../infra/queue';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { AgentBusController } from './agent-bus.controller';
import { AgentInboundController } from './agent-inbound.controller';
import { MemoryProposalController } from './memory-proposal.controller';
import { AgentBusRepository } from './agent-bus.repository';
import { AgentBusService } from './agent-bus.service';
import { AgentConversationLinkService } from './agent-conversation-link.service';
import { AgentDelegationExecutorService } from './agent-delegation-executor.service';
import { AgentDelegationProjectionService } from './agent-delegation-projection.service';
import { AgentInboundAuthService } from './agent-inbound-auth.service';
import { AgentInboundDelegationService } from './agent-inbound-delegation.service';
import { AgentInboundResultService } from './agent-inbound-result.service';
import { MemoryProposalService } from './memory-proposal.service';

@Module({
  imports: [ConversationModule, OpenClawModule, QueueModule],
  controllers: [AgentBusController, AgentInboundController, MemoryProposalController],
  providers: [
    AgentBusRepository,
    AgentBusService,
    AgentConversationLinkService,
    AgentDelegationProjectionService,
    AgentDelegationExecutorService,
    AgentInboundAuthService,
    AgentInboundDelegationService,
    AgentInboundResultService,
    MemoryProposalService,
  ],
  exports: [
    AgentBusRepository,
    AgentBusService,
    AgentConversationLinkService,
    AgentDelegationProjectionService,
    AgentDelegationExecutorService,
    AgentInboundAuthService,
    AgentInboundDelegationService,
    AgentInboundResultService,
    MemoryProposalService,
  ],
})
export class AgentBusModule {}
