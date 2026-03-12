import { Module } from '@nestjs/common';
import { SummarizerController } from './summarizer.controller';
import { SummarizerService } from './summarizer.service';
import { LlmModule } from '../../infra/llm/llm.module';
import { PromptRouterModule } from '../prompt-router/prompt-router.module';
import { MemoryModule } from '../memory/memory.module';
import { PersonaModule } from '../persona/persona.module';
import { IdentityAnchorModule } from '../identity-anchor/identity-anchor.module';

@Module({
  imports: [LlmModule, PromptRouterModule, MemoryModule, PersonaModule, IdentityAnchorModule],
  controllers: [SummarizerController],
  providers: [SummarizerService],
  exports: [SummarizerService],
})
export class SummarizerModule {}
