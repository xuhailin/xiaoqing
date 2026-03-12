import { Injectable } from '@nestjs/common';
import type { DevTaskContext } from '../dev-task-context';
import type {
  DevExecutorCost,
  DevExecutorName,
  DevExecutorOutput,
  DevPlanStep,
  DevStepExecutionLog,
  DevStepResult,
} from '../dev-agent.types';
import { inspectShellCommand, parseShellCommand } from '../shell-command-policy';
import { PREVIEW_LIMIT } from '../dev-agent.constants';
import { DevExecutorResolver } from './dev-executor-resolver';
import { DevStepRoutingService } from './dev-step-routing.service';

/** 执行单 step：preflight validate -> executor execute -> result/log normalize。 */
@Injectable()
export class DevStepRunner {
  constructor(
    private readonly executorResolver: DevExecutorResolver,
    private readonly routingService: DevStepRoutingService,
  ) {}

  async executeStep(
    runId: string,
    sessionId: string,
    taskContext: DevTaskContext,
    step: DevPlanStep,
    stepId: string,
  ): Promise<{ result: DevStepResult; log: DevStepExecutionLog }> {
    const start = new Date();
    let route: { executor: DevExecutorName; cost: DevExecutorCost; reason: string };
    try {
      route = this.routingService.routeStep(step);
    } catch (err) {
      return this.buildRoutingFailure(start, taskContext, step, stepId, err);
    }

    const output = await this.runStepWithPreflight(runId, sessionId, step, route.executor);

    const end = new Date();
    const duration = end.getTime() - start.getTime();
    const parsed = route.executor === 'shell'
      ? parseShellCommand(step.command)
      : { command: step.command, args: [] };
    const stdoutPreview = this.preview(output.stdout ?? (output.success ? output.content : null));
    const stderrPreview = this.preview(output.stderr ?? (!output.success ? output.error : null));
    const failureReason = output.failureReason ?? output.error ?? null;

    const result: DevStepResult = {
      stepIndex: step.index,
      stepId,
      strategy: step.strategy,
      resolvedExecutor: route.executor,
      executor: route.executor,
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
      strategy: step.strategy,
      resolvedExecutor: route.executor,
      routeCost: route.cost,
      routeReason: route.reason,
      errorType: output.errorType ?? null,
      stepType: step.strategy,
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

  private buildRoutingFailure(
    start: Date,
    taskContext: DevTaskContext,
    step: DevPlanStep,
    stepId: string,
    err: unknown,
  ): { result: DevStepResult; log: DevStepExecutionLog } {
    const end = new Date();
    const duration = end.getTime() - start.getTime();
    const reason = err instanceof Error ? err.message : String(err);
    const resolvedExecutor = 'unroutable';
    const failureReason = `路由失败：${reason}`;
    return {
      result: {
        stepIndex: step.index,
        stepId,
        strategy: step.strategy,
        resolvedExecutor,
        executor: resolvedExecutor,
        command: step.command,
        success: false,
        output: null,
        error: failureReason,
        errorType: 'ROUTING_FAILED',
        exitCode: null,
        failureReason,
      },
      log: {
        taskId: taskContext.taskId,
        stepId,
        strategy: step.strategy,
        resolvedExecutor,
        routeCost: null,
        routeReason: failureReason,
        errorType: 'ROUTING_FAILED',
        stepType: step.strategy,
        command: step.command,
        args: [],
        cwd: null,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        duration,
        status: 'failed',
        exitCode: null,
        stdoutPreview: null,
        stderrPreview: this.preview(failureReason),
        failureReason,
      },
    };
  }

  private async runStepWithPreflight(
    runId: string,
    sessionId: string,
    step: DevPlanStep,
    executorName: DevExecutorName,
  ): Promise<DevExecutorOutput> {
    if (executorName === 'shell') {
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

    const executor = this.executorResolver.resolve(executorName);
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
