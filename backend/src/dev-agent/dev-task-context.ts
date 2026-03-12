import type {
  DevPlan,
  DevStepExecutionLog,
  DevStepResult,
  DevExecutorErrorType,
} from './dev-agent.types';

/**
 * DevAgent 独立任务上下文（与聊天上下文隔离）。
 * 生命周期仅覆盖一次 DevRun。
 * 上下文边界与约束见 docs/context-boundary.md。
 */
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

export function createTaskContext(taskId: string, goal: string): DevTaskContext {
  return {
    taskId,
    goal,
    plans: [],
    steps: [],
    stepResults: [],
    stepLogs: [],
    errors: [],
    replanCount: 0,
    consecutiveFailures: 0,
  };
}
