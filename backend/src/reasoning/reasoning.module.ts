import { Module } from '@nestjs/common';
import { IntentReasoner } from './intent-reasoner.service';
import { ToolReasoner } from './tool-reasoner.service';
import { ChainReasoner } from './chain-reasoner.service';
import { ChainExecutor } from './capability-chain';
import { IntentModule } from '../assistant/intent/intent.module';
import { ActionReasonerModule } from '../assistant/action-reasoner/action-reasoner.module';
import { ActionModule } from '../action/action.module';

@Module({
  imports: [IntentModule, ActionReasonerModule, ActionModule],
  providers: [
    IntentReasoner,
    ToolReasoner,
    ChainReasoner,
    ChainExecutor,
  ],
  exports: [
    IntentReasoner,
    ToolReasoner,
    ChainReasoner,
    ChainExecutor,
  ],
})
export class ReasoningModule {}
