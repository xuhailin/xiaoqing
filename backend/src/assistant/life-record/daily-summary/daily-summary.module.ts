import { Module } from '@nestjs/common';
import { LlmModule } from '../../../infra/llm/llm.module';
import { TracePointModule } from '../trace-point/trace-point.module';
import { DailySummaryGenerator } from './daily-summary-generator';
import { DailySummaryService } from './daily-summary.service';
import { DailySummaryController } from './daily-summary.controller';

@Module({
  imports: [LlmModule, TracePointModule],
  controllers: [DailySummaryController],
  providers: [DailySummaryGenerator, DailySummaryService],
  exports: [DailySummaryService],
})
export class DailySummaryModule {}
