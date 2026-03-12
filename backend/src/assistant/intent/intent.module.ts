import { Module } from '@nestjs/common';
import { LlmModule } from '../../infra/llm/llm.module';
import { IntentService } from './intent.service';

@Module({
  imports: [LlmModule],
  providers: [IntentService],
  exports: [IntentService],
})
export class IntentModule {}

