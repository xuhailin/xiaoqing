import { Module } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import { TimesheetSkillService } from './timesheet-skill.service';

@Module({
  providers: [TimesheetSkillService, PrismaService],
  exports: [TimesheetSkillService],
})
export class TimesheetSkillModule {}
