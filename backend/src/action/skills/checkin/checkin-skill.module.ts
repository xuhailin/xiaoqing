import { Module } from '@nestjs/common';
import { CheckinSkillService } from './checkin-skill.service';

@Module({
  providers: [CheckinSkillService],
  exports: [CheckinSkillService],
})
export class CheckinSkillModule {}
