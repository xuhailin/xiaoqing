import { Module } from '@nestjs/common';
import { QueueModule } from '../infra/queue';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { AgentBusController } from './agent-bus.controller';
import { AgentBusRepository } from './agent-bus.repository';
import { AgentBusService } from './agent-bus.service';
import { AgentDelegationExecutorService } from './agent-delegation-executor.service';
import { AgentDelegationProjectionService } from './agent-delegation-projection.service';

@Module({
  imports: [OpenClawModule, QueueModule],
  controllers: [AgentBusController],
  providers: [
    AgentBusRepository,
    AgentBusService,
    AgentDelegationProjectionService,
    AgentDelegationExecutorService,
  ],
  exports: [
    AgentBusRepository,
    AgentBusService,
    AgentDelegationProjectionService,
    AgentDelegationExecutorService,
  ],
})
export class AgentBusModule {}
