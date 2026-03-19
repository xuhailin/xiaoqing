import { Module } from '@nestjs/common';
import { PlanModule } from '../../../plan/plan.module';
import { SocialCarePlannerService } from './social-care-planner.service';
import { SocialCareSchedulerService } from './social-care-scheduler.service';
import { SocialRelationEdgeController } from './social-relation-edge.controller';
import { SocialRelationEdgeService } from './social-relation-edge.service';

@Module({
  imports: [PlanModule],
  controllers: [SocialRelationEdgeController],
  providers: [SocialRelationEdgeService, SocialCarePlannerService, SocialCareSchedulerService],
  exports: [SocialRelationEdgeService, SocialCarePlannerService],
})
export class SocialRelationEdgeModule {}
