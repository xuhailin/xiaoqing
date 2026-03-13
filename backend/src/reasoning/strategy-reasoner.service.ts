import { Injectable } from '@nestjs/common';
import { DevStepRoutingService } from '../dev-agent/execution/dev-step-routing.service';
import type { IReasoner, ReasoningContext, ReasoningResult } from './reasoner.interface';
import type { DevPlanStep } from '../dev-agent/dev-agent.types';

@Injectable()
export class StrategyReasoner implements IReasoner {
  constructor(private readonly routingService: DevStepRoutingService) {}

  async reason(context: ReasoningContext): Promise<ReasoningResult> {
    const step: DevPlanStep = {
      index: 0,
      strategy: this.inferStrategy(context),
      command: context.userInput,
      description: context.userInput,
    };

    try {
      const decision = this.routingService.routeStep(step);
      return {
        decision: 'run_capability',
        capabilities: [decision.executor],
        params: { strategy: decision.strategy, cost: decision.cost },
        reasoning: decision.reason,
      };
    } catch (error) {
      return {
        decision: 'direct_reply',
        capabilities: [],
        reasoning: `Routing failed: ${error.message}`,
      };
    }
  }

  private inferStrategy(context: ReasoningContext): DevPlanStep['strategy'] {
    const input = context.userInput.toLowerCase();
    if (input.includes('inspect') || input.includes('查看') || input.includes('检查')) {
      return 'inspect';
    }
    if (input.includes('verify') || input.includes('验证') || input.includes('测试')) {
      return 'verify';
    }
    if (input.includes('edit') || input.includes('修改') || input.includes('编辑')) {
      return 'edit';
    }
    return 'autonomous_coding';
  }
}
