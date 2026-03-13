import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActionModule } from '../../action/action.module';
import { SystemSelfModule } from '../../system-self/system-self.module';
import { TaskPlannerModule } from '../planning/task-planner.module';
import { ActionReasonerService } from './action-reasoner.service';

@Module({
  imports: [ConfigModule, ActionModule, SystemSelfModule, TaskPlannerModule],
  providers: [ActionReasonerService],
  exports: [ActionReasonerService],
})
export class ActionReasonerModule {}
