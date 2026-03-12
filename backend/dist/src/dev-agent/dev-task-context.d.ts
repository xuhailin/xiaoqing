import type { DevPlan, DevStepExecutionLog, DevStepResult, DevExecutorErrorType } from './dev-agent.types';
export interface DevTaskContext {
    taskId: string;
    goal: string;
    plans: Array<{
        round: number;
        plan: DevPlan;
    }>;
    steps: DevPlan['steps'];
    stepResults: DevStepResult[];
    stepLogs: DevStepExecutionLog[];
    errors: DevTaskErrorRecord[];
    replanCount: number;
    consecutiveFailures: number;
}
export interface DevTaskErrorRecord {
    stepId: string;
    errorType: DevExecutorErrorType;
    message: string;
    command: string;
    createdAt: string;
}
export declare function createTaskContext(taskId: string, goal: string): DevTaskContext;
