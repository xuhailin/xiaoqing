import { Module } from '@nestjs/common';
import { DailyMomentModule } from './daily-moment/daily-moment.module';
import { TracePointModule } from './trace-point/trace-point.module';
import { DailySummaryModule } from './daily-summary/daily-summary.module';

@Module({
  imports: [DailyMomentModule, TracePointModule, DailySummaryModule],
  exports: [DailyMomentModule, TracePointModule, DailySummaryModule],
})
export class LifeRecordModule {}
