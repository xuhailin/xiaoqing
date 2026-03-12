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
    reply: string;
}
export type DevExecutorErrorType = 'COMMAND_NOT_ALLOWED' | 'HIGH_RISK_SYNTAX' | 'COMMAND_NOT_FOUND' | 'NON_ZERO_EXIT' | 'TIMEOUT' | 'FILE_NOT_FOUND' | 'PERMISSION_DENIED' | 'UNKNOWN';
export interface DevPlan {
    steps: DevPlanStep[];
    summary: string;
}
export interface DevPlanStep {
    index: number;
    description: string;
    executor: 'shell' | 'openclaw' | 'claude-code';
    command: string;
}
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
