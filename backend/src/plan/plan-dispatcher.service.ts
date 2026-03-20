import { Injectable, Logger } from '@nestjs/common';
import { PlanDispatchType, ReminderScope } from '@prisma/client';
import type { Plan, TaskOccurrence } from '@prisma/client';
import type { DispatchResult } from './plan.types';

export interface DispatchStrategyResult {
  resultRef?: string;
  resultPayload?: Record<string, unknown>;
}

/**
 * Plan 分发策略接口。
 * 每种 dispatchType 对应一个实现（Phase 2 迁移时补全）。
 */
export interface IPlanDispatchStrategy {
  readonly type: PlanDispatchType;
  dispatch(plan: Plan, occurrence: TaskOccurrence): Promise<DispatchStrategyResult>;
}

@Injectable()
export class PlanDispatcher {
  private readonly logger = new Logger(PlanDispatcher.name);
  private readonly strategies = new Map<PlanDispatchType, IPlanDispatchStrategy>();

  /** 注册一个分发策略 */
  registerStrategy(strategy: IPlanDispatchStrategy) {
    this.strategies.set(strategy.type, strategy);
    this.logger.log(`Registered dispatch strategy: ${strategy.type}`);
  }

  /** 根据 Plan 的 dispatchType 分发 occurrence */
  async dispatch(plan: Plan, occurrence: TaskOccurrence): Promise<DispatchResult> {
    const strategy = this.strategies.get(plan.dispatchType);

    if (!strategy) {
      this.logger.warn(`No dispatch strategy for type=${plan.dispatchType}, treating as noop`);
      return { occurrenceId: occurrence.id, planId: plan.id };
    }

    const result = await strategy.dispatch(plan, occurrence);
    return {
      occurrenceId: occurrence.id,
      planId: plan.id,
      resultRef: result.resultRef,
      resultPayload: result.resultPayload,
    };
  }
}
