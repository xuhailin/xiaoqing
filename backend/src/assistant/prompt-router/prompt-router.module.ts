import { Module } from '@nestjs/common';
import { PromptRouterService } from './prompt-router.service';
import { LlmModule } from '../../infra/llm/llm.module';

@Module({
  imports: [LlmModule],
  providers: [PromptRouterService],
  exports: [PromptRouterService],
})
export class PromptRouterModule {}
