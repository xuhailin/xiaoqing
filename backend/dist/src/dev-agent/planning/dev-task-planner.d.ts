import { LlmService } from '../../infra/llm/llm.service';
import type { DevTaskContext } from '../dev-task-context';
import type { DevPlan } from '../dev-agent.types';
import { DevPlannerPromptFactory } from './dev-planner-prompt.factory';
import { DevPlanParser } from './dev-plan-parser';
import { DevPlanNormalizer } from './dev-plan-normalizer';
export declare class DevTaskPlanner {
    private readonly llm;
    private readonly promptFactory;
    private readonly parser;
    private readonly normalizer;
    constructor(llm: LlmService, promptFactory: DevPlannerPromptFactory, parser: DevPlanParser, normalizer: DevPlanNormalizer);
    planTask(goal: string, taskContext: DevTaskContext, options: {
        round: number;
        replanReason: string | null;
    }): Promise<DevPlan>;
}
