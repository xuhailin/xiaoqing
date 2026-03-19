import { Module } from '@nestjs/common';
import { DailyMomentModule } from './daily-moment/daily-moment.module';
import { TracePointModule } from './trace-point/trace-point.module';
import { DailySummaryModule } from './daily-summary/daily-summary.module';
import { SocialEntityModule } from './social-entity/social-entity.module';
import { SocialInsightModule } from './social-insight/social-insight.module';
import { SocialRelationEdgeModule } from './social-relation-edge/social-relation-edge.module';

@Module({
  imports: [DailyMomentModule, TracePointModule, DailySummaryModule, SocialEntityModule, SocialInsightModule, SocialRelationEdgeModule],
  exports: [DailyMomentModule, TracePointModule, DailySummaryModule, SocialEntityModule, SocialInsightModule, SocialRelationEdgeModule],
})
export class LifeRecordModule {}
