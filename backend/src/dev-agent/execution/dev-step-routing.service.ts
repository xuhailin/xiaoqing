import { Injectable } from '@nestjs/common';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import type { ICapability } from '../../action/capability.interface';
import type {
  DevExecutorCost,
  DevExecutorName,
  IDevExecutor,
  DevPlanStep,
  DevStepStrategy,
} from '../dev-agent.types';
import { isDevExecutorName } from '../dev-agent.types';
import { inspectShellCommand } from '../shell-command-policy';

interface StrategyRoutingPolicy {
  maxCost: DevExecutorCost;
  shellOrder: 'prefer' | 'defer' | 'dynamic';
}

const STRATEGY_ROUTING_POLICY: Record<DevStepStrategy, StrategyRoutingPolicy> = {
  inspect: {
    maxCost: 'low',
    shellOrder: 'prefer',
  },
  verify: {
    maxCost: 'low',
    shellOrder: 'prefer',
  },
  edit: {
    maxCost: 'high',
    shellOrder: 'dynamic',
  },
  autonomous_coding: {
    maxCost: 'high',
    shellOrder: 'defer',
  },
};

export interface DevStepRoutingDecision {
  strategy: DevStepStrategy;
  executor: DevExecutorName;
  cost: DevExecutorCost;
  reason: string;
}

/**
 * 将策略步骤路由到具体执行器，集中承载能力可用性 + 成本优先级 + 降级策略。
 */
@Injectable()
export class DevStepRoutingService {
  constructor(private readonly capabilityRegistry: CapabilityRegistry) {}

  routeStep(step: DevPlanStep, overrides?: { availableExecutors?: DevExecutorName[] }): DevStepRoutingDecision {
    const policy = STRATEGY_ROUTING_POLICY[step.strategy];
    const available = this.listAvailableExecutors(overrides?.availableExecutors);
    const candidates = this.buildCandidateOrder(
      step,
      available,
      policy,
    );

    if (candidates.length > 0) {
      const selected = candidates[0];
      return {
        strategy: step.strategy,
        executor: selected.name,
        cost: selected.costLevel,
        reason: `strategy=${step.strategy}, claudeCodePreferred=${selected.name === 'claude-code'}, policy=maxCost:${policy.maxCost};shellOrder:${policy.shellOrder}, selected=${selected.name}, cost=${selected.costLevel}`,
      };
    }

    const availableNames = available.map((e) => e.name).join(',') || 'none';
    throw new Error(
      `No available executor for strategy=${step.strategy} with policy(maxCost=${policy.maxCost}, shellOrder=${policy.shellOrder}) (available=${availableNames})`,
    );
  }

  private listAvailableExecutors(allowList?: DevExecutorName[]): IDevExecutor[] {
    const allowed = allowList ? new Set(allowList) : null;
    const availableCaps = this.capabilityRegistry.listAvailable('dev');
    const executors: IDevExecutor[] = [];
    for (const cap of availableCaps) {
      if (!isDevExecutorName(cap.name)) continue;
      if (allowed && !allowed.has(cap.name)) continue;
      if (this.isRoutableExecutor(cap)) {
        executors.push(cap);
      }
    }
    return executors;
  }

  private buildCandidateOrder(
    step: DevPlanStep,
    available: IDevExecutor[],
    policy: StrategyRoutingPolicy,
  ): IDevExecutor[] {
    const supported = available
      .filter((executor) => executor.supportedStrategies.includes(step.strategy));

    // Claude Code 可用时优先承担 dev 执行，避免 planner 对 search/edit/verify 粒度判断不准时把任务切碎。
    const preferredClaude = supported.find((executor) => executor.name === 'claude-code');
    const fallback = supported
      .filter((executor) => executor.name !== 'claude-code')
      .filter((executor) => this.costRank(executor.costLevel) <= this.costRank(policy.maxCost))
      .sort((a, b) => this.costRank(a.costLevel) - this.costRank(b.costLevel));

    const orderedFallback = this.orderByShellPolicy(step, fallback, policy);

    return preferredClaude ? [preferredClaude, ...orderedFallback] : orderedFallback;
  }

  private orderByShellPolicy(
    step: DevPlanStep,
    executors: IDevExecutor[],
    policy: StrategyRoutingPolicy,
  ): IDevExecutor[] {
    if (policy.shellOrder === 'prefer') {
      return this.prioritizeShell(executors);
    }

    if (policy.shellOrder === 'defer') {
      return this.deferShell(executors);
    }

    if (step.strategy === 'edit') {
      const shellReady = inspectShellCommand(step.command).allowed;
      return shellReady ? this.prioritizeShell(executors) : this.deferShell(executors);
    }

    return executors;
  }

  private prioritizeShell(executors: IDevExecutor[]): IDevExecutor[] {
    const shell = executors.find((executor) => executor.name === 'shell');
    if (!shell) return executors;
    return [shell, ...executors.filter((executor) => executor.name !== 'shell')];
  }

  private deferShell(executors: IDevExecutor[]): IDevExecutor[] {
    const shell = executors.find((executor) => executor.name === 'shell');
    if (!shell) return executors;
    return [...executors.filter((executor) => executor.name !== 'shell'), shell];
  }

  private isRoutableExecutor(capability: ICapability): capability is ICapability & IDevExecutor {
    const maybe = capability as unknown as Partial<IDevExecutor>;
    return (
      Array.isArray(maybe.supportedStrategies) &&
      maybe.supportedStrategies.every((s) => this.isStrategy(s)) &&
      (maybe.costLevel === 'low' || maybe.costLevel === 'medium' || maybe.costLevel === 'high')
    );
  }

  private isStrategy(value: unknown): value is DevStepStrategy {
    return value === 'inspect' ||
      value === 'edit' ||
      value === 'verify' ||
      value === 'autonomous_coding';
  }

  private costRank(cost: DevExecutorCost): number {
    if (cost === 'low') return 1;
    if (cost === 'medium') return 2;
    return 3;
  }
}
