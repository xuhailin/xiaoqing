import { Module } from '@nestjs/common';
import { LlmModule } from '../../infra/llm/llm.module';
import { SessionReflectionController } from './session-reflection.controller';
import { SessionReflectionService } from './session-reflection.service';

@Module({
  imports: [LlmModule],
  controllers: [SessionReflectionController],
  providers: [SessionReflectionService],
  exports: [SessionReflectionService],
})
export class SessionReflectionModule {}
