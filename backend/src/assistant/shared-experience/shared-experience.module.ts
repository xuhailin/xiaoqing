import { Module } from '@nestjs/common';
import { LlmModule } from '../../infra/llm/llm.module';
import { PlanModule } from '../../plan/plan.module';
import { SessionReflectionModule } from '../session-reflection/session-reflection.module';
import { SharedExperienceFollowupSchedulerService } from './shared-experience-followup-scheduler.service';
import { SharedExperienceFollowupService } from './shared-experience-followup.service';
import { SharedExperienceController } from './shared-experience.controller';
import { SharedExperienceService } from './shared-experience.service';

@Module({
  imports: [LlmModule, SessionReflectionModule, PlanModule],
  controllers: [SharedExperienceController],
  providers: [SharedExperienceService, SharedExperienceFollowupService, SharedExperienceFollowupSchedulerService],
  exports: [SharedExperienceService, SharedExperienceFollowupService],
})
export class SharedExperienceModule {}
