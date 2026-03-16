import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IDevExecutor, DevExecutorInput, DevExecutorOutput } from './executor.interface';
import type { DevExecutorCost, DevExecutorErrorType, DevStepStrategy } from '../dev-agent.types';
import type { ICapability } from '../../action/capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../action/capability.types';
import type { MessageChannel } from '../../gateway/message-router.types';
import { ClaudeCodeStreamService } from './claude-code-stream.service';
import { WorkspaceManager } from '../workspace/workspace-manager.service';

/**
 * Claude Code Agent 执行器 — 将任务委派给 Claude Code Agent SDK 执行。
 *
 * 适用于代码生成、修改、重构、bug 修复等需要多步骤自主编码的任务。
 * 通过 ClaudeCodeStreamService 与 Claude Code Agent SDK 通信。
 * 支持 WorkspaceManager 提供的 workspace 隔离。
 *
 * 同时实现 IDevExecutor（DevAgent 向后兼容）和 ICapability（统一能力接口）。
 */
@Injectable()
export class ClaudeCodeExecutor implements IDevExecutor, ICapability {
  readonly name = 'claude-code';
  readonly supportedStrategies: DevStepStrategy[] = ['inspect', 'edit', 'verify', 'autonomous_coding'];
  readonly costLevel: DevExecutorCost = 'high';
  readonly taskIntent = 'claude_code_agent';
  readonly channels: MessageChannel[] = ['dev'];
  readonly description = 'Claude Code Agent 自主执行（排查/编码/验证/重构/bug 修复）';
  readonly surface = 'dev' as const;
  readonly scope = 'private' as const;
  readonly portability = 'environment-bound' as const;
  readonly requiresAuth = false;
  readonly requiresUserContext = true;
  readonly visibility = 'default' as const;

  private readonly logger = new Logger(ClaudeCodeExecutor.name);
  private readonly enabled: boolean;

  /** 活跃执行中的 AbortController，用于 cancel */
  private readonly activeAbortControllers = new Map<string, AbortController>();

  constructor(
    private readonly streamService: ClaudeCodeStreamService,
    private readonly workspaceManager: WorkspaceManager,
    config: ConfigService,
  ) {
    this.enabled = config.get('FEATURE_CLAUDE_CODE') === 'true';
  }

  isAvailable(): boolean {
    return this.enabled;
  }

  // ── ICapability.execute / IDevExecutor.execute ──────────
  async execute(request: CapabilityRequest): Promise<CapabilityResult>;
  async execute(input: DevExecutorInput): Promise<DevExecutorOutput>;
  async execute(input: CapabilityRequest | DevExecutorInput): Promise<CapabilityResult | DevExecutorOutput> {
    const userInput = 'params' in input && 'conversationId' in input
      ? (typeof input.params.taskMessage === 'string' ? input.params.taskMessage : '')
      : (input as DevExecutorInput).userInput;

    const runId = 'runId' in input ? (input as DevExecutorInput).runId : 'unknown';
    this.logger.log(`[claude-code] runId=${runId} starting agent execution`);

    if (!this.enabled) {
      this.logger.warn('Claude Code Agent 已禁用（FEATURE_CLAUDE_CODE!=true）');
      return {
        success: false,
        content: null,
        error: 'Claude Code Agent 已禁用',
        errorType: 'UNKNOWN',
        exitCode: 1,
        command: 'claude-code.execute',
        args: [],
        cwd: null,
        stdout: null,
        stderr: 'FEATURE_CLAUDE_CODE is not enabled',
        durationMs: null,
        failureReason: 'Claude Code Agent 未启用，请设置 FEATURE_CLAUDE_CODE=true',
        retryHint: null,
      };
    }

    const sessionId = 'sessionId' in input ? (input as DevExecutorInput).sessionId : 'unknown';

    const abortController = new AbortController();
    this.activeAbortControllers.set(runId, abortController);

    const startTime = Date.now();

    try {
      // 获取隔离 workspace（worktree 或 shared）
      const workspace = await this.workspaceManager.acquire(sessionId);
      const cwd = workspace.cwd;

      this.logger.log(
        `[claude-code] runId=${runId} workspace: strategy=${workspace.strategy} cwd=${cwd}`,
      );

      const result = await this.streamService.execute(
        userInput,
        {
          cwd,
          abortController,
        },
      );

      const durationMs = Date.now() - startTime;

      return {
        success: result.success,
        content: result.content,
        error: result.error,
        errorType: result.success ? null : this.classifyError(result),
        exitCode: result.success ? 0 : 1,
        command: 'claude-code.execute',
        args: [],
        cwd,
        stdout: result.content,
        stderr: result.error,
        durationMs,
        failureReason: result.success ? null : result.error,
        retryHint: result.success ? null : '可尝试细化任务描述后重试。',
        artifacts: {
          sessionId: result.sessionId,
          costUsd: result.costUsd,
          numTurns: result.numTurns,
          stopReason: result.stopReason,
          workspaceStrategy: workspace.strategy,
          workspaceBranch: workspace.branch,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        content: null,
        error: `工作目录不可用：${message}`,
        errorType: 'FILE_NOT_FOUND',
        exitCode: 1,
        command: 'claude-code.execute',
        args: [],
        cwd: null,
        stdout: null,
        stderr: message,
        durationMs: Date.now() - startTime,
        failureReason: message,
        retryHint: '请检查 workspace 路径是否存在且可访问。',
      };
    } finally {
      this.activeAbortControllers.delete(runId);
    }
  }

  /**
   * 取消指定 runId 的执行。
   */
  cancel(runId: string): boolean {
    const controller = this.activeAbortControllers.get(runId);
    if (controller) {
      controller.abort();
      this.activeAbortControllers.delete(runId);
      this.logger.log(`[claude-code] runId=${runId} execution cancelled`);
      return true;
    }
    return false;
  }

  private classifyError(result: { stopReason: string | null; error: string | null }): DevExecutorErrorType {
    if (result.stopReason === 'cancelled') return 'TIMEOUT';
    if (result.error?.includes('rate_limit')) return 'TIMEOUT';
    if (result.error?.includes('authentication')) return 'PERMISSION_DENIED';
    return 'NON_ZERO_EXIT';
  }
}
