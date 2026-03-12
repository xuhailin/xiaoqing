import { Module } from '@nestjs/common';
import { GeneralActionSkillService } from './general-action-skill.service';

@Module({
  providers: [GeneralActionSkillService],
  exports: [GeneralActionSkillService],
})
export class GeneralActionSkillModule {}
