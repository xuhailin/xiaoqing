import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ModelConfigService } from './model-config.service';
import { ModelConfigController } from './model-config.controller';

@Module({
  controllers: [ModelConfigController],
  providers: [ModelConfigService, LlmService],
  exports: [ModelConfigService, LlmService],
})
export class LlmModule {}
