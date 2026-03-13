import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { AssistantOrchestrator } from './assistant-orchestrator.service';
import { ChatCompletionEngine } from './chat-completion.engine';
import { ChatCompletionRunner } from './chat-completion-runner.service';
import { TurnContextAssembler } from './turn-context-assembler.service';
import { SummarizeTriggerService } from './summarize-trigger.service';
import { FeatureFlagConfig } from './feature-flag.config';
import { ActionReasonerModule } from '../action-reasoner/action-reasoner.module';
import { LlmModule } from '../../infra/llm/llm.module';
import { PromptRouterModule } from '../prompt-router/prompt-router.module';
import { MemoryModule } from '../memory/memory.module';
import { PersonaModule } from '../persona/persona.module';
import { IntentModule } from '../intent/intent.module';
import { OpenClawModule } from '../../openclaw/openclaw.module';
import { ActionModule } from '../../action/action.module';
import { WorldStateModule } from '../../infra/world-state/world-state.module';
import { IdentityAnchorModule } from '../identity-anchor/identity-anchor.module';
import { SummarizerModule } from '../summarizer/summarizer.module';
import { CognitivePipelineModule } from '../cognitive-pipeline/cognitive-pipeline.module';
import { MetaLayerService } from '../meta-layer/meta-layer.service';
import { DailyMomentModule } from '../daily-moment/daily-moment.module';
import { PostTurnPipeline } from '../post-turn/post-turn.pipeline';
import { SystemSelfModule } from '../../system-self/system-self.module';

@Module({
  imports: [ActionReasonerModule, LlmModule, PromptRouterModule, MemoryModule, PersonaModule, IntentModule, OpenClawModule, ActionModule, WorldStateModule, IdentityAnchorModule, SummarizerModule, CognitivePipelineModule, DailyMomentModule, SystemSelfModule],
  controllers: [ConversationController],
  providers: [
    ConversationService,
    AssistantOrchestrator,
    ChatCompletionEngine,
    ChatCompletionRunner,
    TurnContextAssembler,
    SummarizeTriggerService,
    FeatureFlagConfig,
    PostTurnPipeline,
    MetaLayerService,
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
