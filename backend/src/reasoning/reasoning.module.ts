import { Module } from '@nestjs/common';
import { ChainReasoner } from './chain-reasoner.service';
import { ChainExecutor } from './capability-chain';
import { IntentModule } from '../assistant/intent/intent.module';
import { ActionReasonerModule } from '../assistant/action-reasoner/action-reasoner.module';
import { ActionModule } from '../action/action.module';

@Module({
  imports: [IntentModule, ActionReasonerModule, ActionModule],
  providers: [
    ChainReasoner,
    ChainExecutor,
  ],
  exports: [
    ChainReasoner,
    ChainExecutor,
  ],
})
export class ReasoningModule {}
