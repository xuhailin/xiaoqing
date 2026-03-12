import { Injectable, Logger } from '@nestjs/common';
import { isDevExecutorName } from '../dev-agent.types';
import type { DevPlan, DevPlanStep, DevStepStrategy } from '../dev-agent.types';

/** 解析 Planner 输出 JSON，异常时降级为单步 shell 计划。 */
@Injectable()
export class DevPlanParser {
  private readonly logger = new Logger(DevPlanParser.name);

  parse(response: string, fallbackCommand: string): DevPlan {
    try {
      const cleaned = this.extractJson(response);
      const parsed = JSON.parse(cleaned) as Partial<DevPlan>;
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      if (steps.length === 0) {
        throw new Error('empty steps');
      }

      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : fallbackCommand,
        steps: steps.map((step, i) => this.parseStep(step as Partial<DevPlanStep>, i, fallbackCommand)),
      };
    } catch {
      this.logger.warn('Failed to parse LLM plan, falling back to single shell step');
      return {
        summary: fallbackCommand,
        steps: [
          {
            index: 1,
            description: fallbackCommand,
            strategy: 'inspect',
            command: fallbackCommand,
          },
        ],
      };
    }
  }

  private parseStep(rawStep: Partial<DevPlanStep>, index: number, fallbackCommand: string): DevPlanStep {
    // legacy executor 字段仅用于兼容输入，不回写到标准化 step 结构。
    const legacyExecutor = isDevExecutorName(rawStep.executor)
      ? rawStep.executor.trim()
      : null;
    if (legacyExecutor) {
      this.logger.debug(`Legacy executor hint ignored in parser: ${legacyExecutor}`);
    }
    const strategy = this.parseStrategy(rawStep.strategy);
    return {
      index: rawStep.index ?? index + 1,
      description: rawStep.description ?? '',
      strategy,
      command: rawStep.command ?? fallbackCommand,
    };
  }

  private parseStrategy(rawStrategy: DevPlanStep['strategy'] | undefined): DevStepStrategy {
    if (
      rawStrategy === 'inspect' ||
      rawStrategy === 'edit' ||
      rawStrategy === 'verify' ||
      rawStrategy === 'autonomous_coding'
    ) {
      return rawStrategy;
    }

    return 'inspect';
  }

  private extractJson(response: string): string {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    return (jsonMatch[1] ?? response).trim();
  }
}
