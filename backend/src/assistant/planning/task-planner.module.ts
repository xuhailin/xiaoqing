import { Module } from '@nestjs/common';
import { TaskPlannerService } from './task-planner.service';

@Module({
  providers: [TaskPlannerService],
  exports: [TaskPlannerService],
})
export class TaskPlannerModule {}
