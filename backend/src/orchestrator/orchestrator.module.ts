import { Module } from '@nestjs/common';
import { ConversationModule } from '../assistant/conversation/conversation.module';
import { IntentModule } from '../assistant/intent/intent.module';
import { DevAgentModule } from '../dev-agent/dev-agent.module';
import { LlmModule } from '../infra/llm/llm.module';
import { DispatcherService } from './dispatcher.service';
import { ConversationLockService } from './conversation-lock.service';
import { AssistantAgentAdapter } from './assistant-agent.adapter';
import { DevAgentAdapter } from './dev-agent.adapter';
import { MessageRouterService } from '../gateway/message-router.service';
import { AGENT_TOKEN } from './agent.interface';

@Module({
  imports: [ConversationModule, IntentModule, DevAgentModule, LlmModule],
  providers: [
    ConversationLockService,
    AssistantAgentAdapter,
    DevAgentAdapter,
    MessageRouterService,
    // 将两个 adapter 组装为 IAgent[] 注入 dispatcher
    {
      provide: AGENT_TOKEN,
      useFactory: (assistant: AssistantAgentAdapter, dev: DevAgentAdapter) => [
        assistant,
        dev,
      ],
      inject: [AssistantAgentAdapter, DevAgentAdapter],
    },
    DispatcherService,
  ],
  exports: [DispatcherService],
})
export class OrchestratorModule {}
