import type { DevTaskContext } from '../dev-task-context';
import type { DevPlanStep, DevStepExecutionLog, DevStepResult } from '../dev-agent.types';
import { DevExecutorResolver } from './dev-executor-resolver';
export declare class DevStepRunner {
    private readonly executorResolver;
    constructor(executorResolver: DevExecutorResolver);
    executeStep(runId: string, sessionId: string, taskContext: DevTaskContext, step: DevPlanStep, stepId: string): Promise<{
        result: DevStepResult;
        log: DevStepExecutionLog;
    }>;
    private runStepWithPreflight;
    private preview;
}
