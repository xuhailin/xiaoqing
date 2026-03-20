import { Injectable, Logger } from '@nestjs/common';
import { PlanDispatchType, TaskMode } from '@prisma/client';
import type { Plan, TaskOccurrence } from '@prisma/client';
import type { IPlanDispatchStrategy } from '../plan-dispatcher.service';
import type { CapabilityRegistry } from '../../action/capability-registry.service';

/**
 * action 分发策略：通过 CapabilityRegistry 执行任意能力。
 * Plan.actionPayload 中需包含 { capability, params } 描述执行目标。
 */
@Injectable()
export class ActionDispatchStrategy implements IPlanDispatchStrategy {
  readonly type = PlanDispatchType.action;
  private readonly logger = new Logger(ActionDispatchStrategy.name);

  private capabilityRegistry: CapabilityRegistry | null = null;

  /** 延迟注入，避免循环依赖 */
  setCapabilityRegistry(registry: CapabilityRegistry) {
    this.capabilityRegistry = registry;
  }

  async dispatch(
    plan: Plan,
    occurrence: TaskOccurrence,
  ): Promise<{ resultRef?: string; resultPayload?: Record<string, unknown> }> {
    if (!this.capabilityRegistry) {
      this.logger.error(`CapabilityRegistry not injected, cannot dispatch action for plan=${plan.id}`);
      return {};
    }

    const payload = plan.actionPayload as Record<string, unknown> | null;
    const capabilityName = occurrence.action ?? (typeof payload?.capability === 'string' ? payload.capability : null);
    const params = (occurrence.params as Record<string, unknown> | null) ?? (payload?.params as Record<string, unknown>) ?? {};

    if (!capabilityName) {
      this.logger.warn(`Plan ${plan.id} has dispatchType=action but no valid actionPayload.capability`);
      return {};
    }

    if (occurrence.mode === TaskMode.notify) {
      this.logger.log(`Occurrence ${occurrence.id} is notify-only, skip capability execution`);
      return {
        resultRef: `action:${occurrence.id}:notify-only`,
        resultPayload: {
          capability: capabilityName,
          mode: occurrence.mode,
          success: true,
          skipped: true,
          reason: 'notify-only occurrence',
          params,
        },
      };
    }

    const result = await this.capabilityRegistry.execute(capabilityName, {
      conversationId: plan.conversationId ?? '',
      turnId: occurrence.id,
      userInput: plan.description ?? plan.title ?? '',
      params,
    });

    if (result.success) {
      this.logger.log(`Action dispatched: plan=${plan.id} → capability=${capabilityName}`);
    } else {
      this.logger.warn(`Action dispatch failed: plan=${plan.id}, error=${result.error}`);
    }

    return {
      resultRef: `action:${occurrence.id}:${result.success ? 'ok' : 'fail'}`,
      resultPayload: {
        capability: capabilityName,
        mode: occurrence.mode,
        params,
        success: result.success,
        content: result.content,
        error: result.error,
        meta: result.meta,
      },
    };
  }
}
