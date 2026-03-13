import { Injectable } from '@nestjs/common';
import { LlmService } from '../../infra/llm/llm.service';
import type { DevTaskContext } from '../dev-task-context';
import type { DevPlan } from '../dev-agent.types';
import { DevPlannerPromptFactory } from './dev-planner-prompt.factory';
import { DevPlanParser } from './dev-plan-parser';
import { DevPlanNormalizer } from './dev-plan-normalizer';
import { SystemSelfService } from '../../system-self/system-self.service';

/** Dev 任务规划入口：prompt -> LLM -> parse -> normalize。 */
@Injectable()
export class DevTaskPlanner {
  constructor(
    private readonly llm: LlmService,
    private readonly promptFactory: DevPlannerPromptFactory,
    private readonly parser: DevPlanParser,
    private readonly normalizer: DevPlanNormalizer,
    private readonly systemSelf: SystemSelfService,
  ) {}

  async planTask(
    goal: string,
    taskContext: DevTaskContext,
    options: { round: number; replanReason: string | null },
  ): Promise<DevPlan> {
    const { systemPrompt, userPrompt } = this.promptFactory.create(goal, taskContext, options);
    const response = await this.llm.generate([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { scenario: 'dev' });
    const parsed = this.parser.parse(response, goal);
    return this.normalizer.normalize(parsed, goal);
  }
}
