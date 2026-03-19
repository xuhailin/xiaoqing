import { Module } from '@nestjs/common';
import { LlmModule } from '../../../infra/llm/llm.module';
import { SocialInsightController } from './social-insight.controller';
import { SocialInsightSchedulerService } from './social-insight-scheduler.service';
import { SocialInsightService } from './social-insight.service';

@Module({
  imports: [LlmModule],
  controllers: [SocialInsightController],
  providers: [SocialInsightService, SocialInsightSchedulerService],
  exports: [SocialInsightService],
})
export class SocialInsightModule {}
