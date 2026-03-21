import { Module } from '@nestjs/common';
import { DailySummaryModule } from '../daily-summary/daily-summary.module';
import { DailyMomentService } from './daily-moment.service';
import { DailyMomentPrismaRepository } from './daily-moment-prisma.repository';

@Module({
  imports: [DailySummaryModule],
  providers: [
    DailyMomentPrismaRepository,
    DailyMomentService,
  ],
  exports: [DailyMomentService],
})
export class DailyMomentModule {}
