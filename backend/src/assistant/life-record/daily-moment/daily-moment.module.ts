import { Module } from '@nestjs/common';
import { TracePointModule } from '../trace-point/trace-point.module';
import { DailySummaryModule } from '../daily-summary/daily-summary.module';
import { DailyMomentPolicy } from './daily-moment-policy';
import { DailyMomentService } from './daily-moment.service';
import { DailyMomentPrismaRepository } from './daily-moment-prisma.repository';

@Module({
  imports: [TracePointModule, DailySummaryModule],
  providers: [
    DailyMomentPolicy,
    DailyMomentPrismaRepository,
    DailyMomentService,
  ],
  exports: [DailyMomentService],
})
export class DailyMomentModule {}
