import { Injectable } from '@nestjs/common';
import { PlanDispatchType } from '@prisma/client';
import type { Plan, TaskOccurrence } from '@prisma/client';
import type { IPlanDispatchStrategy } from '../plan-dispatcher.service';

@Injectable()
export class NoopDispatchStrategy implements IPlanDispatchStrategy {
  readonly type = PlanDispatchType.noop;

  async dispatch(
    plan: Plan,
    occurrence: TaskOccurrence,
  ): Promise<{ resultRef?: string; resultPayload?: Record<string, unknown> }> {
    return {
      resultRef: `noop:${occurrence.id}`,
      resultPayload: {
        dispatchType: plan.dispatchType,
        success: true,
        skippedExecution: true,
      },
    };
  }
}
