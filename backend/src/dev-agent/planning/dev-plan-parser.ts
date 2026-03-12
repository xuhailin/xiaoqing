import { Injectable, Logger } from '@nestjs/common';
import type { DevPlan, DevPlanStep } from '../dev-agent.types';

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
        steps: steps as DevPlanStep[],
      };
    } catch {
      this.logger.warn('Failed to parse LLM plan, falling back to single shell step');
      return {
        summary: fallbackCommand,
        steps: [
          {
            index: 1,
            description: fallbackCommand,
            executor: 'shell',
            command: fallbackCommand,
          },
        ],
      };
    }
  }

  private extractJson(response: string): string {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    return (jsonMatch[1] ?? response).trim();
  }
}
