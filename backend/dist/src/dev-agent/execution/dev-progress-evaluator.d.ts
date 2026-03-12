import { LlmService } from '../../infra/llm/llm.service';
import type { DevTaskContext } from '../dev-task-context';
export declare class DevProgressEvaluator {
    private readonly llm;
    constructor(llm: LlmService);
    evaluateTaskProgress(goal: string, taskContext: DevTaskContext, options: {
        hasRemainingRoundSteps: boolean;
    }): Promise<{
        done: boolean;
        reason: string;
    }>;
    private preview;
}
