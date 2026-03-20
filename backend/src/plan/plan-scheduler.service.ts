import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PlanService } from './plan.service';
import { TaskOccurrenceService } from './task-occurrence.service';
import { TaskExecutor } from './task-executor.service';
import { isFeatureEnabled } from '../config/feature-flags';

@Injectable()
export class PlanSchedulerService {
  private readonly logger = new Logger(PlanSchedulerService.name);
  private pollInProgress = false;

  constructor(
    private readonly config: ConfigService,
    private readonly planService: PlanService,
    private readonly occurrenceService: TaskOccurrenceService,
    private readonly taskExecutor: TaskExecutor,
  ) {}

  @Cron('*/15 * * * * *')
  async handlePolling() {
    if (!this.isEnabled()) return;
    if (this.pollInProgress) return;

    this.pollInProgress = true;
    try {
      await this.dispatchDuePlans();
    } catch (err) {
      this.logger.error(`Plan polling error: ${String(err)}`);
    } finally {
      this.pollInProgress = false;
    }
  }

  private async dispatchDuePlans(limit = 10) {
    const now = new Date();
    const duePlans = await this.planService.findDuePlans(now, limit);

    let triggered = 0;
    for (const plan of duePlans) {
      try {
        const scheduledAt = plan.nextRunAt!;

        // 检查是否被 skip
        const skipped = await this.occurrenceService.isSkipped(plan.id, scheduledAt);
        if (skipped) {
          this.logger.log(`Plan ${plan.id} occurrence at ${scheduledAt.toISOString()} is skipped`);
          await this.planService.advanceAfterTrigger(plan.id, now);
          continue;
        }

        // 通过 TaskExecutor 执行（统一链路：Plan → Task → Capability）
        await this.taskExecutor.execute(plan);

        // 推进 Plan 到下一次
        await this.planService.advanceAfterTrigger(plan.id, now);

        triggered++;
      } catch (err) {
        this.logger.error(`Failed to dispatch plan ${plan.id}: ${String(err)}`);
        await this.planService.recordError(plan.id, String(err));
      }
    }

    if (triggered > 0) {
      this.logger.log(`Plan scheduler: ${triggered}/${duePlans.length} dispatched`);
    }
  }

  private isEnabled(): boolean {
    return isFeatureEnabled(this.config, 'planScheduler');
  }
}
