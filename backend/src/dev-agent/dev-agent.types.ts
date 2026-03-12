/** DevAgent 任务执行结果，返回给前端 */
export interface DevTaskResult {
  session: {
    id: string;
    status: string;
  };
  run: {
    id: string;
    status: string;
    executor: string | null;
    plan: DevPlan | null;
    result: unknown;
    error: string | null;
    artifactPath: string | null;
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
  | 'TIMEOUT'
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN';

/** LLM 生成的执行计划 */
export interface DevPlan {
  steps: DevPlanStep[];
  summary: string;
}

export interface DevPlanStep {
  /** 步骤序号 */
  index: number;
  /** 步骤描述 */
  description: string;
  /** 选择的执行器 */
  executor: 'shell' | 'openclaw' | 'claude-code';
  /** 要执行的具体命令/指令 */
  command: string;
}

/** 执行器统一接口 */
export interface IDevExecutor {
  readonly name: string;
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
