import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IDevAgentExecutor,
  AgentExecutorInput,
  AgentExecutorOutput,
  AgentProgressEvent,
} from '../dev-agent.types';
import { ClaudeCodeStreamService } from './claude-code-stream.service';

/**
 * Claude Code Agent Executor — run-level 整任务委派。
 *
 * 将完整任务目标直接交给 Claude Code Agent SDK 自主执行，
 * 不走 Planner/StepRunner/Evaluator，由 Claude Code 内部完成规划与工具调用。
 */
@Injectable()
export class ClaudeCodeAgentExecutor implements IDevAgentExecutor {
  readonly name = 'claude-code';

  private readonly logger = new Logger(ClaudeCodeAgentExecutor.name);
  private readonly enabled: boolean;
  private readonly activeAbortControllers = new Map<string, AbortController>();

  constructor(
    private readonly streamService: ClaudeCodeStreamService,
    config: ConfigService,
  ) {
    this.enabled = config.get('FEATURE_CLAUDE_CODE') === 'true';
  }

  isAvailable(): boolean {
    return this.enabled;
  }

  async execute(
    input: AgentExecutorInput,
    onProgress?: (event: AgentProgressEvent) => void,
  ): Promise<AgentExecutorOutput> {
    if (!this.enabled) {
      return {
        success: false,
        content: null,
        error: 'Claude Code Agent 已禁用（FEATURE_CLAUDE_CODE!=true）',
        durationMs: 0,
        costUsd: 0,
        numTurns: 0,
        sessionId: null,
        stopReason: 'disabled',
      };
    }

    const abortController = new AbortController();
    this.activeAbortControllers.set(input.runId, abortController);

    // 如果外部传了 abortSignal，同步转发
    if (input.abortSignal) {
      input.abortSignal.addEventListener('abort', () => abortController.abort(), { once: true });
    }

    this.logger.log(
      `[claude-code-agent] runId=${input.runId} starting, cwd=${input.cwd}`,
    );

    const startTime = Date.now();

    try {
      const result = await this.streamService.execute(
        input.userInput,
        {
          cwd: input.cwd,
          abortController,
          allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
          resumeSessionId: input.resumeSessionId,
        },
        onProgress,
      );

      const durationMs = Date.now() - startTime;

      return {
        success: result.success,
        content: result.content,
        error: result.error,
        durationMs,
        costUsd: result.costUsd,
        numTurns: result.numTurns,
        sessionId: result.sessionId,
        stopReason: result.stopReason,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[claude-code-agent] runId=${input.runId} error: ${message}`);

      return {
        success: false,
        content: null,
        error: message,
        durationMs: Date.now() - startTime,
        costUsd: 0,
        numTurns: 0,
        sessionId: null,
        stopReason: 'error',
      };
    } finally {
      this.activeAbortControllers.delete(input.runId);
    }
  }

  cancel(runId: string): boolean {
    const controller = this.activeAbortControllers.get(runId);
    if (controller) {
      controller.abort();
      this.activeAbortControllers.delete(runId);
      this.logger.log(`[claude-code-agent] runId=${runId} cancelled`);
      return true;
    }
    return false;
  }
}
