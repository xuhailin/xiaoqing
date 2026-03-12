import { Injectable } from '@nestjs/common';
import type { DevTaskContext } from '../dev-task-context';
import type {
  DevExecutorOutput,
  DevPlanStep,
  DevStepExecutionLog,
  DevStepResult,
} from '../dev-agent.types';
import { inspectShellCommand, parseShellCommand } from '../shell-command-policy';
import { PREVIEW_LIMIT } from '../dev-agent.constants';
import { DevExecutorResolver } from './dev-executor-resolver';

/** 执行单 step：preflight validate -> executor execute -> result/log normalize。 */
@Injectable()
export class DevStepRunner {
  constructor(private readonly executorResolver: DevExecutorResolver) {}

  async executeStep(
    runId: string,
    sessionId: string,
    taskContext: DevTaskContext,
    step: DevPlanStep,
    stepId: string,
  ): Promise<{ result: DevStepResult; log: DevStepExecutionLog }> {
    const start = new Date();

    const output = await this.runStepWithPreflight(runId, sessionId, step);

    const end = new Date();
    const duration = end.getTime() - start.getTime();
    const parsed = step.executor === 'shell'
      ? parseShellCommand(step.command)
      : { command: step.command, args: [] };
    const stdoutPreview = this.preview(output.stdout ?? (output.success ? output.content : null));
    const stderrPreview = this.preview(output.stderr ?? (!output.success ? output.error : null));
    const failureReason = output.failureReason ?? output.error ?? null;

    const result: DevStepResult = {
      stepIndex: step.index,
      stepId,
      executor: step.executor,
      command: step.command,
      success: output.success,
      output: output.content,
      error: output.error,
      errorType: output.errorType ?? null,
      exitCode: output.exitCode ?? null,
      failureReason,
    };

    const log: DevStepExecutionLog = {
      taskId: taskContext.taskId,
      stepId,
      stepType: step.executor,
      command: output.command ?? parsed.command,
      args: output.args ?? parsed.args,
      cwd: output.cwd ?? null,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      duration,
      status: output.success ? 'success' : 'failed',
      exitCode: output.exitCode ?? null,
      stdoutPreview,
      stderrPreview,
      failureReason,
    };

    return { result, log };
  }

  private async runStepWithPreflight(
    runId: string,
    sessionId: string,
    step: DevPlanStep,
  ): Promise<DevExecutorOutput> {
    if (step.executor === 'shell') {
      const preflight = inspectShellCommand(step.command);
      if (!preflight.allowed) {
        return {
          success: false,
          content: null,
          error: `执行前拦截：命令 "${preflight.command || step.command}" 不可执行`,
          errorType: 'COMMAND_NOT_ALLOWED',
          exitCode: null,
          command: preflight.command || step.command,
          args: preflight.args,
          cwd: null,
          stdout: null,
          stderr: null,
          durationMs: 0,
          failureReason: preflight.suggestion ?? '命令不在允许列表',
          retryHint: preflight.suggestedCommand
            ? `建议命令：${preflight.suggestedCommand}`
            : '请改用 allowlist 命令',
        };
      }
    }

    const executor = this.executorResolver.resolve(step.executor);
    return executor.execute({
      runId,
      userInput: step.command,
      sessionId,
    }) as Promise<DevExecutorOutput>;
  }

  private preview(text: string | null | undefined): string | null {
    if (!text) return null;
    const normalized = text.trim();
    if (!normalized) return null;
    return normalized.length > PREVIEW_LIMIT
      ? `${normalized.slice(0, PREVIEW_LIMIT)}...`
      : normalized;
  }
}
