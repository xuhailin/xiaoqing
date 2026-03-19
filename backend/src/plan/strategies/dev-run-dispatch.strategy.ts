import { Injectable, Logger } from '@nestjs/common';
import { PlanDispatchType, DevRunStatus } from '@prisma/client';
import type { Prisma, Plan, TaskOccurrence } from '@prisma/client';
import type { IPlanDispatchStrategy } from '../plan-dispatcher.service';
import { PrismaService } from '../../infra/prisma.service';
import type { DevRunRunnerService } from '../../dev-agent/dev-runner.service';

/**
 * dev_run 分发策略：创建 DevRun 并入队执行。
 * 复用现有的 DevAgent 执行链路。
 */
@Injectable()
export class DevRunDispatchStrategy implements IPlanDispatchStrategy {
  readonly type = PlanDispatchType.dev_run;
  private readonly logger = new Logger(DevRunDispatchStrategy.name);

  private runner: DevRunRunnerService | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** 延迟注入，避免循环依赖 */
  setRunner(runner: DevRunRunnerService) {
    this.runner = runner;
  }

  async dispatch(plan: Plan, occurrence: TaskOccurrence): Promise<{ resultRef?: string }> {
    if (!plan.sessionId) {
      this.logger.warn(`dev_run dispatch requires sessionId, plan=${plan.id} has none`);
      return {};
    }

    if (!this.runner) {
      this.logger.error(`DevRunRunnerService not injected, cannot dispatch dev_run for plan=${plan.id}`);
      return {};
    }

    const run = await this.prisma.devRun.create({
      data: {
        sessionId: plan.sessionId,
        userInput: plan.description ?? plan.title ?? '',
        status: DevRunStatus.queued,
        result: {
          phase: 'queued',
          source: 'plan',
          planId: plan.id,
          occurrenceId: occurrence.id,
          currentStepId: null,
          planRounds: 0,
          completedSteps: 0,
          totalSteps: 0,
          stepLogs: [],
          events: [
            {
              type: 'scheduled_trigger',
              message: `计划任务已入队：${plan.title ?? plan.description ?? ''}`,
              at: new Date().toISOString(),
            },
          ],
        } as Prisma.InputJsonValue,
      },
      select: { id: true, sessionId: true },
    });

    this.runner.startRun(run.id, run.sessionId);

    this.logger.log(`dev_run dispatched: plan=${plan.id} → run=${run.id}`);
    return { resultRef: `devRun:${run.id}` };
  }
}
