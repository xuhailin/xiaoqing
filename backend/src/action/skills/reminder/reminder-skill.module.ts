import { Module } from '@nestjs/common';
import { ReminderSkillService } from './reminder-skill.service';
import { ReminderMessageService } from './reminder-message.service';
import { LlmModule } from '../../../infra/llm/llm.module';
import { PlanModule } from '../../../plan/plan.module';

@Module({
  imports: [LlmModule, PlanModule],
  providers: [ReminderSkillService, ReminderMessageService],
  exports: [ReminderSkillService, ReminderMessageService],
})
export class ReminderSkillModule {}
