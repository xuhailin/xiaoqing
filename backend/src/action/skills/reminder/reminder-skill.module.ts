import { Module } from '@nestjs/common';
import { ReminderSkillService } from './reminder-skill.service';
import { ReminderMessageService } from './reminder-message.service';
import { LlmModule } from '../../../infra/llm/llm.module';

@Module({
  imports: [LlmModule],
  providers: [ReminderSkillService, ReminderMessageService],
  exports: [ReminderSkillService, ReminderMessageService],
})
export class ReminderSkillModule {}
