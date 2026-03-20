import { Injectable, Logger } from '@nestjs/common';
import { TaskMode } from '@prisma/client';
import type { Plan } from '@prisma/client';
import { PlanDispatcher } from './plan-dispatcher.service';
import { TaskOccurrenceService, type TaskDescriptor } from './task-occurrence.service';
import type { TaskTemplate } from './plan.types';

/**
 * Plan 触发时的 Task 执行结果。
 */
export interface TaskExecutionResult {
  occurrenceId: string;
  resultRef?: string;
  resultPayload?: Record<string, unknown>;
}

/**
 * TaskExecutor — Plan → Task → Capability 的统一执行入口。
 *
 * 职责：
 * 1. 从 Plan 提取 Task 描述（单个或多个 taskTemplates）
 * 2. 创建 TaskOccurrence 记录
 * 3. 委派给 PlanDispatcher 执行（复用现有 strategy 体系）
 * 4. 将执行结果写回 TaskOccurrence
 *
 * 设计要点：
 * - 多 Task：当 Plan.taskTemplates 存在时，遍历生成多个 Task 并依次执行
 * - 兼容：无 taskTemplates 时回退到单 Task 路径（actionPayload 或 dispatchType）
 */
@Injectable()
export class TaskExecutor {
  private readonly logger = new Logger(TaskExecutor.name);

  constructor(
    private readonly occurrenceService: TaskOccurrenceService,
    private readonly dispatcher: PlanDispatcher,
  ) {}

  /**
   * 执行一个 Plan 的当次触发。
   * 由 PlanSchedulerService 调用，替代原来的 dispatcher.dispatch() 直调。
   */
  async execute(plan: Plan): Promise<TaskExecutionResult[]> {
    const scheduledAt = plan.nextRunAt!;
    const tasks = this.extractTasksFromPlan(plan);
    const results: TaskExecutionResult[] = [];

    for (const task of tasks) {
      const result = await this.executeOne(plan, scheduledAt, task);
      results.push(result);
    }

    return results;
  }

  private async executeOne(
    plan: Plan,
    scheduledAt: Date,
    task: TaskDescriptor,
  ): Promise<TaskExecutionResult> {
    const occurrence = await this.occurrenceService.createOccurrence(
      plan.id,
      scheduledAt,
      task,
    );

    try {
      const result = await this.dispatcher.dispatch(plan, occurrence);
      await this.occurrenceService.markDone(occurrence.id, result.resultRef, result.resultPayload);

      this.logger.log(
        `Task executed: plan=${plan.id}, occurrence=${occurrence.id}, ` +
        `action=${task.action ?? plan.dispatchType}, mode=${task.mode}`,
      );

      return {
        occurrenceId: occurrence.id,
        resultRef: result.resultRef,
        resultPayload: result.resultPayload,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.occurrenceService.markFailed(occurrence.id, errorMessage);
      this.logger.error(
        `Task execution failed: plan=${plan.id}, occurrence=${occurrence.id}: ${errorMessage}`,
      );
      throw err;
    }
  }

  /**
   * 从 Plan 中提取 Task 列表。
   *
   * 优先级：
   * 1. taskTemplates（多 Task 场景）
   * 2. actionPayload.capability（单 Task action 场景）
   * 3. 回退到 dispatchType 路由（兼容旧 Plan）
   */
  private extractTasksFromPlan(plan: Plan): TaskDescriptor[] {
    // 优先：多 Task 模板
    const templates = plan.taskTemplates as TaskTemplate[] | null;
    if (Array.isArray(templates) && templates.length > 0) {
      return templates.map((t) => ({
        action: t.action,
        params: t.params ?? {},
        mode: t.mode ?? TaskMode.execute,
      }));
    }

    // 其次：单 actionPayload
    const payload = plan.actionPayload as Record<string, unknown> | null;
    if (payload?.capability && typeof payload.capability === 'string') {
      return [{
        action: payload.capability,
        params: (payload.params as Record<string, unknown>) ?? {},
        mode: TaskMode.execute,
      }];
    }

    // 兼容：无 Task 描述时，由 PlanDispatcher 按 dispatchType 路由
    return [{
      mode: plan.dispatchType === 'notify' ? TaskMode.notify : TaskMode.execute,
    }];
  }
}
