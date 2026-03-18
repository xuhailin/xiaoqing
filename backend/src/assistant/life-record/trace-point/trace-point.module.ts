import { Module } from '@nestjs/common';
import { LlmModule } from '../../../infra/llm/llm.module';
import { TracePointService } from './trace-point.service';
import { TracePointExtractorService } from './trace-point-extractor.service';
import { TracePointController } from './trace-point.controller';

@Module({
  imports: [LlmModule],
  controllers: [TracePointController],
  providers: [TracePointService, TracePointExtractorService],
  exports: [TracePointService, TracePointExtractorService],
})
export class TracePointModule {}
