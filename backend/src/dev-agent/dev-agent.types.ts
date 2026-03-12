import type { DevWorkspaceMeta } from './workspace/workspace-meta';

/** DevAgent 任务执行结果，返回给前端 */
export interface DevTaskResult {
  session: {
    id: string;
    status: string;
    workspace: DevWorkspaceMeta | null;
  };
  run: {
    id: string;
    status: string;
    executor: string | null;
    plan: DevPlan | null;
    result: unknown;
    error: string | null;
    artifactPath: string | null;
    workspace: DevWorkspaceMeta | null;
  };
  /** 小晴对用户的自然语言回复 */
  reply: string;
}

/** 统一执行错误分类（用于重规划与稳定性治理） */
export type DevExecutorErrorType =
  | 'COMMAND_NOT_ALLOWED'
  | 'HIGH_RISK_SYNTAX'
  | 'COMMAND_NOT_FOUND'
  | 'NON_ZERO_EXIT'
  | 'ROUTING_FAILED'
  | 'TIMEOUT'
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN';

/** LLM 生成的执行计划 */
export interface DevPlan {
  steps: DevPlanStep[];
  summary: string;
}

export type DevStepStrategy = 'inspect' | 'edit' | 'verify' | 'autonomous_coding';
export type DevExecutorName = string;
export type DevExecutorCost = 'low' | 'medium' | 'high';
export const DEV_EXECUTOR_NAME_RE = /^[a-z][a-z0-9-]*$/;

export function isDevExecutorName(value: unknown): value is DevExecutorName {
  return typeof value === 'string' && DEV_EXECUTOR_NAME_RE.test(value.trim());
}

export interface DevPlanStep {
  /** 步骤序号 */
  index: number;
  /** 步骤描述 */
  description: string;
  /** 步骤策略（高层任务类型） */
  strategy: DevStepStrategy;
  /** 兼容旧 planner 输出，主逻辑不再依赖 */
  executor?: DevExecutorName;
  /** 要执行的具体命令/指令 */
  command: string;
}

/** 执行器统一接口 */
export interface IDevExecutor {
  readonly name: DevExecutorName;
  readonly supportedStrategies: DevStepStrategy[];
  readonly costLevel: DevExecutorCost;
  execute(input: DevExecutorInput): Promise<DevExecutorOutput>;
}

export interface DevExecutorInput {
  runId: string;
  userInput: string;
  sessionId: string;
}

export interface DevExecutorOutput {
  success: boolean;
  content: string | null;
  error: string | null;
  errorType?: DevExecutorErrorType | null;
  exitCode?: number | null;
  command?: string | null;
  args?: string[];
  cwd?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  durationMs?: number | null;
  failureReason?: string | null;
  retryHint?: string | null;
  artifacts?: Record<string, unknown>;
}

/** 单个步骤的执行结果 */
export interface DevStepResult {
  stepIndex: number;
  stepId?: string;
  strategy: DevStepStrategy;
  /** 最终路由到的执行器 */
  resolvedExecutor: DevExecutorName;
  /** 兼容旧字段：等于 resolvedExecutor */
  executor: string;
  command: string;
  success: boolean;
  output: string | null;
  error: string | null;
  errorType?: DevExecutorErrorType | null;
  exitCode?: number | null;
  failureReason?: string | null;
}

/** 每一步的结构化执行日志，用于诊断与追踪 */
export interface DevStepExecutionLog {
  taskId: string;
  stepId: string;
  strategy: DevStepStrategy;
  resolvedExecutor: DevExecutorName;
  routeCost: DevExecutorCost | null;
  routeReason: string;
  errorType: DevExecutorErrorType | null;
  stepType: string;
  command: string;
  args: string[];
  cwd: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'success' | 'failed';
  exitCode: number | null;
  stdoutPreview: string | null;
  stderrPreview: string | null;
  failureReason: string | null;
}
