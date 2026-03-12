import { Injectable, Logger } from '@nestjs/common';
import { isDevExecutorName } from '../dev-agent.types';
import type { DevPlan, DevPlanStep } from '../dev-agent.types';
import { inspectShellCommand } from '../shell-command-policy';
import { MAX_STEPS_PER_ROUND } from '../dev-agent.constants';

/** 规划归一化：收敛 strategy/command，并修正明显非法 shell 命令。 */
@Injectable()
export class DevPlanNormalizer {
  private readonly logger = new Logger(DevPlanNormalizer.name);

  normalize(plan: DevPlan, fallbackCommand: string): DevPlan {
    return {
      summary: plan.summary,
      steps: plan.steps
        .slice(0, MAX_STEPS_PER_ROUND)
        .map((rawStep, i) => this.coerceStep(rawStep, i, fallbackCommand))
        .map((step) => this.normalizeShellStep(step, fallbackCommand)),
    };
  }

  private coerceStep(rawStep: Partial<DevPlanStep>, index: number, fallbackCommand: string): DevPlanStep {
    // legacy executor 字段仅用于兼容输入，不回写到标准化 step 结构。
    const legacyExecutor = isDevExecutorName(rawStep.executor)
      ? rawStep.executor.trim()
      : null;
    if (legacyExecutor) {
      this.logger.debug(`Legacy executor hint ignored in normalizer: ${legacyExecutor}`);
    }
    const strategy = rawStep.strategy === 'edit' ||
      rawStep.strategy === 'verify' ||
      rawStep.strategy === 'autonomous_coding'
      ? rawStep.strategy
      : 'inspect';

    return {
      index: rawStep.index ?? index + 1,
      description: rawStep.description ?? '',
      strategy,
      command: rawStep.command ?? fallbackCommand,
    };
  }

  private normalizeShellStep(step: DevPlanStep, fallbackCommand: string): DevPlanStep {
    if (!this.isShellLikeStep(step)) return step;

    const rawCommand = step.command?.trim() || fallbackCommand;
    const policy = inspectShellCommand(rawCommand);
    if (policy.allowed) {
      return { ...step, command: rawCommand };
    }

    if (policy.suggestedCommand) {
      this.logger.warn(
        `Plan step ${step.index} uses disallowed command "${policy.command}", auto-replaced with "${policy.suggestedCommand}"`,
      );
      return { ...step, command: policy.suggestedCommand };
    }

    return { ...step, command: rawCommand };
  }

  private isShellLikeStep(step: DevPlanStep): boolean {
    if (step.strategy === 'inspect' || step.strategy === 'verify') return true;
    if (step.strategy === 'edit') {
      return inspectShellCommand(step.command).allowed;
    }
    return false;
  }
}
