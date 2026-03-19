import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlanService } from './plan.service';
import { TaskOccurrenceService } from './task-occurrence.service';
import { PlanSchedulerService } from './plan-scheduler.service';
import { PlanDispatcher } from './plan-dispatcher.service';
import { PlanController } from './plan.controller';
import { NotifyDispatchStrategy } from './strategies/notify-dispatch.strategy';
import { DevRunDispatchStrategy } from './strategies/dev-run-dispatch.strategy';

@Module({
  imports: [ConfigModule],
  controllers: [PlanController],
  providers: [
    PlanService,
    TaskOccurrenceService,
    PlanSchedulerService,
    PlanDispatcher,
    NotifyDispatchStrategy,
    DevRunDispatchStrategy,
  ],
  exports: [PlanService, TaskOccurrenceService, PlanDispatcher, NotifyDispatchStrategy, DevRunDispatchStrategy],
})
export class PlanModule implements OnModuleInit {
  constructor(
    private readonly dispatcher: PlanDispatcher,
    private readonly notifyStrategy: NotifyDispatchStrategy,
    private readonly devRunStrategy: DevRunDispatchStrategy,
  ) {}

  onModuleInit() {
    this.dispatcher.registerStrategy(this.notifyStrategy);
    this.dispatcher.registerStrategy(this.devRunStrategy);
  }
}
