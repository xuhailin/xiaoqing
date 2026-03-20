import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlanService } from './plan.service';
import { TaskOccurrenceService } from './task-occurrence.service';
import { PlanSchedulerService } from './plan-scheduler.service';
import { PlanDispatcher } from './plan-dispatcher.service';
import { TaskExecutor } from './task-executor.service';
import { PlanController } from './plan.controller';
import { NotifyDispatchStrategy } from './strategies/notify-dispatch.strategy';
import { DevRunDispatchStrategy } from './strategies/dev-run-dispatch.strategy';
import { ActionDispatchStrategy } from './strategies/action-dispatch.strategy';
import { NoopDispatchStrategy } from './strategies/noop-dispatch.strategy';

@Module({
  imports: [ConfigModule],
  controllers: [PlanController],
  providers: [
    PlanService,
    TaskOccurrenceService,
    PlanSchedulerService,
    PlanDispatcher,
    TaskExecutor,
    NotifyDispatchStrategy,
    DevRunDispatchStrategy,
    ActionDispatchStrategy,
    NoopDispatchStrategy,
  ],
  exports: [
    PlanService,
    TaskOccurrenceService,
    PlanDispatcher,
    TaskExecutor,
    NotifyDispatchStrategy,
    DevRunDispatchStrategy,
    ActionDispatchStrategy,
    NoopDispatchStrategy,
  ],
})
export class PlanModule implements OnModuleInit {
  constructor(
    private readonly dispatcher: PlanDispatcher,
    private readonly notifyStrategy: NotifyDispatchStrategy,
    private readonly devRunStrategy: DevRunDispatchStrategy,
    private readonly actionStrategy: ActionDispatchStrategy,
    private readonly noopStrategy: NoopDispatchStrategy,
  ) {}

  onModuleInit() {
    this.dispatcher.registerStrategy(this.notifyStrategy);
    this.dispatcher.registerStrategy(this.devRunStrategy);
    this.dispatcher.registerStrategy(this.actionStrategy);
    this.dispatcher.registerStrategy(this.noopStrategy);
  }
}
