import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { basename, resolve } from 'path';
import type { IDevExecutor, DevExecutorInput, DevExecutorOutput } from './executor.interface';
import type { ICapability } from '../../action/capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../action/capability.types';
import type { MessageChannel } from '../../gateway/message-router.types';
import {
  inspectShellCommand,
  ALLOWED_SHELL_COMMANDS,
  planShellAutoFix,
} from '../shell-command-policy';
import type { DevExecutorCost, DevExecutorErrorType, DevStepStrategy } from '../dev-agent.types';
import { WorkspaceManager } from '../workspace/workspace-manager.service';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 100_000; // 100KB
const READ_ONLY_PATH_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'find']);

interface ShellRunOptions {
  suppressStderr: boolean;
  headLimit: number | null;
}

/**
 * Shell 执行器 — sandboxed child_process 执行。
 * 安全策略：命令白名单 + 黑名单 + timeout + 输出截断 + cwd 限制。
 *
 * 同时实现 IDevExecutor（DevAgent 向后兼容）和 ICapability（统一能力接口）。
 */
@Injectable()
export class ShellExecutor implements IDevExecutor, ICapability {
  readonly name = 'shell';
  readonly supportedStrategies: DevStepStrategy[] = ['inspect', 'edit', 'verify'];
  readonly costLevel: DevExecutorCost = 'low';
  readonly taskIntent = 'shell_command';
  readonly channels: MessageChannel[] = ['dev'];
  readonly description = '本地 shell 命令执行（ls/cat/grep/git/npm 等）';
  readonly surface = 'dev' as const;
  readonly scope = 'private' as const;
  readonly portability = 'environment-bound' as const;
  readonly requiresAuth = false;
  readonly requiresUserContext = true;
  readonly visibility = 'default' as const;

  private readonly logger = new Logger(ShellExecutor.name);

  constructor(private readonly workspaceManager: WorkspaceManager) {}

  isAvailable(): boolean {
    return true; // shell 始终可用
  }

  // ── ICapability.execute ────────────────────────────────
  async execute(request: CapabilityRequest): Promise<CapabilityResult>;
  async execute(input: DevExecutorInput): Promise<DevExecutorOutput>;
  async execute(input: CapabilityRequest | DevExecutorInput): Promise<CapabilityResult | DevExecutorOutput> {
    const userInput = 'params' in input && 'conversationId' in input
      ? (typeof input.params.command === 'string' ? input.params.command : input.userInput)
      : (input as DevExecutorInput).userInput;

    const runId = 'runId' in input ? (input as DevExecutorInput).runId : undefined;
    const sessionId = this.resolveSessionId(input);

    let cwd: string;
    try {
      cwd = await this.resolveCwd(sessionId, runId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        content: null,
        error: `工作目录不可用：${message}`,
        errorType: 'FILE_NOT_FOUND',
        exitCode: null,
        command: null,
        args: [],
        cwd: null,
        stdout: null,
        stderr: message,
        durationMs: 0,
        failureReason: message,
        retryHint: '请检查 workspace 路径是否存在且可访问。',
      };
    }

    const result = await this.executeCommand(userInput, cwd, runId);
    return result;
  }

  private async executeCommand(
    userInput: string,
    cwd: string,
    runId?: string,
  ): Promise<DevExecutorOutput> {
    const startAt = Date.now();
    const policy = inspectShellCommand(userInput);
    if (!policy.allowed) {
      const hint = policy.suggestion ? `；替代建议：${policy.suggestion}` : '';
      return {
        success: false,
        content: null,
        command: policy.command || '',
        args: policy.args,
        cwd,
        error: `命令 "${policy.command || userInput.trim()}" 不可执行（${policy.reason}）。允许的命令：${ALLOWED_SHELL_COMMANDS.join(', ')}${hint}`,
        errorType: policy.reason === 'blocked' || policy.reason === 'not_allowed'
          ? 'COMMAND_NOT_ALLOWED'
          : 'UNKNOWN',
        exitCode: null,
        stdout: null,
        stderr: null,
        durationMs: Date.now() - startAt,
        failureReason: policy.suggestion ?? '命令校验失败',
        retryHint: policy.suggestedCommand
          ? `可尝试：${policy.suggestedCommand}`
          : '请改用允许列表内命令后重试',
      };
    }
    const { command, args } = policy;
    const autoFixPlan = planShellAutoFix(command, args);
    if (autoFixPlan.risk === 'high') {
      return {
        success: false,
        content: null,
        command,
        args,
        cwd,
        error: `命令包含高风险 shell 语法，已停止自动修复：${autoFixPlan.reason ?? 'unknown'}`,
        errorType: 'HIGH_RISK_SYNTAX',
        exitCode: null,
        stdout: null,
        stderr: null,
        durationMs: Date.now() - startAt,
        failureReason: autoFixPlan.reason ?? '高风险语法，不自动修复',
        retryHint: '请改为无管道/重定向/命令拼接的单条命令，或拆分为多步后重试。',
      };
    }

    const effectiveArgs = autoFixPlan.shouldApply ? autoFixPlan.fixedArgs : args;
    const runOptions: ShellRunOptions = {
      suppressStderr: autoFixPlan.shouldApply && autoFixPlan.suppressStderr,
      headLimit: autoFixPlan.shouldApply ? autoFixPlan.headLimit : null,
    };

    if (autoFixPlan.shouldApply) {
      this.logger.warn(
        `[shell] ${runId ? `runId=${runId} ` : ''}low-risk autofix applied: ${autoFixPlan.notes.join('; ') || 'args normalized'}`,
      );
    }
    this.logger.log(
      `[shell] ${runId ? `runId=${runId} ` : ''}cwd=${cwd} cmd="${command}" args=${JSON.stringify(effectiveArgs)}`,
    );

    let result = await this.runCommandOnce(command, effectiveArgs, runOptions, cwd, runId);
    const prefixFixResult = await this.tryPathPrefixAutoFix(
      command,
      effectiveArgs,
      runOptions,
      cwd,
      runId,
      result,
    );
    if (prefixFixResult) {
      result = prefixFixResult;
    }

    if (!autoFixPlan.shouldApply) {
      return result;
    }

    const note = `低风险自动修复已应用：${autoFixPlan.notes.join('；') || '参数标准化'}`;
    if (result.success) {
      return {
        ...result,
        content: result.content ? `${note}\n${result.content}` : note,
      };
    }

    return {
      ...result,
      failureReason: [result.failureReason, note].filter(Boolean).join('；'),
      retryHint: [result.retryHint, `自动修复后执行参数：${JSON.stringify(effectiveArgs)}`]
        .filter(Boolean)
        .join('；'),
    };
  }

  private runCommandOnce(
    command: string,
    args: string[],
    options: ShellRunOptions,
    cwd: string,
    runId?: string,
  ): Promise<DevExecutorOutput> {
    const startAt = Date.now();

    return new Promise<DevExecutorOutput>((resolve) => {
      const child = execFile(
        command,
        args,
        {
          cwd,
          timeout: DEFAULT_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          env: { ...process.env, NODE_ENV: 'development' },
        },
        (error, stdout, stderr) => {
          const limitedStdout = this.limitLines(stdout ?? '', options.headLimit);
          const safeStdout = this.truncate(limitedStdout);
          const safeStderr = this.truncate(stderr ?? '');
          const visibleStderr = options.suppressStderr ? '' : safeStderr;
          const output = this.truncate(safeStdout + (visibleStderr ? `\n[stderr]\n${visibleStderr}` : ''));
          const durationMs = Date.now() - startAt;

          if (error) {
            const isTimeout = error.killed || error.code === 'ETIMEDOUT';
            const failure = this.classifyFailure(error, safeStderr, safeStdout, isTimeout);
            this.logger.warn(`[shell] ${runId ? `runId=${runId} ` : ''}error: ${error.message}`);
            resolve({
              success: false,
              content: output || null,
              command,
              args,
              cwd,
              stdout: safeStdout || null,
              stderr: options.suppressStderr ? null : (safeStderr || null),
              durationMs,
              exitCode: failure.exitCode,
              errorType: failure.errorType,
              failureReason: failure.reason,
              retryHint: failure.retryHint,
              error: isTimeout
                ? `命令执行超时（${DEFAULT_TIMEOUT_MS / 1000}s）`
                : error.message,
            });
            return;
          }

          resolve({
            success: true,
            content: output || '（命令执行成功，无输出）',
            error: null,
            errorType: null,
            exitCode: 0,
            command,
            args,
            cwd,
            stdout: safeStdout || null,
            stderr: options.suppressStderr ? null : (safeStderr || null),
            durationMs,
            failureReason: null,
            retryHint: null,
          });
        },
      );

      // 确保子进程在异常情况下被清理
      child.on('error', (err) => {
        this.logger.error(`[shell] spawn error: ${err.message}`);
        const failure = this.classifySpawnFailure(err.message);
        resolve({
          success: false,
          content: null,
          error: `进程启动失败: ${err.message}`,
          command,
          args,
          cwd,
          stdout: null,
          stderr: options.suppressStderr ? null : err.message,
          durationMs: Date.now() - startAt,
          exitCode: null,
          errorType: failure.errorType,
          failureReason: failure.reason,
          retryHint: failure.retryHint,
        });
      });
    });
  }

  private async resolveCwd(sessionId?: string, runId?: string): Promise<string> {
    if (!sessionId) {
      return this.workspaceManager.getDefaultWorkspaceRoot();
    }

    try {
      const workspace = await this.workspaceManager.acquire(sessionId);
      return workspace.cwd;
    } catch (err) {
      if (this.workspaceManager.hasSessionWorkspace(sessionId)) {
        throw err;
      }
      this.logger.warn(
        `[shell] ${runId ? `runId=${runId} ` : ''}workspace acquire failed, fallback to project root: ${String(err)}`,
      );
      return this.workspaceManager.getDefaultWorkspaceRoot();
    }
  }

  private resolveSessionId(input: CapabilityRequest | DevExecutorInput): string | undefined {
    if ('sessionId' in input) {
      return (input as DevExecutorInput).sessionId;
    }

    const raw = input.params?.['__devSessionId'];
    return typeof raw === 'string' && raw.trim().length > 0
      ? raw.trim()
      : undefined;
  }

  private classifyFailure(
    error: Error & { code?: number | string | null },
    stderr: string,
    stdout: string,
    isTimeout: boolean,
  ): {
    errorType: DevExecutorErrorType;
    exitCode: number | null;
    reason: string;
    retryHint: string | null;
  } {
    const text = `${stderr}\n${stdout}`;
    const lower = text.toLowerCase();
    const numericExitCode = typeof error.code === 'number' ? error.code : null;

    if (isTimeout) {
      return {
        errorType: 'TIMEOUT',
        exitCode: numericExitCode,
        reason: `命令执行超时（>${DEFAULT_TIMEOUT_MS / 1000}s）`,
        retryHint: '请缩小命令范围或拆分为更小步骤后重试。',
      };
    }

    if (error.code === 'ENOENT' || lower.includes('command not found')) {
      return {
        errorType: 'COMMAND_NOT_FOUND',
        exitCode: numericExitCode,
        reason: '命令不存在或不可用',
        retryHint: `请改用允许列表命令：${ALLOWED_SHELL_COMMANDS.join(', ')}`,
      };
    }

    if (error.code === 'EACCES' || lower.includes('permission denied')) {
      return {
        errorType: 'PERMISSION_DENIED',
        exitCode: numericExitCode,
        reason: '权限不足',
        retryHint: '请检查目标路径权限或改为读取类命令。',
      };
    }

    if (lower.includes('no such file or directory')) {
      return {
        errorType: 'FILE_NOT_FOUND',
        exitCode: numericExitCode,
        reason: '文件或目录不存在',
        retryHint: '先用 ls/find 确认路径是否存在，再执行后续命令。',
      };
    }

    if (numericExitCode !== null) {
      return {
        errorType: 'NON_ZERO_EXIT',
        exitCode: numericExitCode,
        reason: `命令返回非 0 退出码（${numericExitCode}）`,
        retryHint: '请先检查 stderr 信息，并拆分命令逐步验证。',
      };
    }

    return {
      errorType: 'UNKNOWN',
      exitCode: null,
      reason: '未知执行错误',
      retryHint: null,
    };
  }

  private classifySpawnFailure(message: string): {
    errorType: DevExecutorErrorType;
    reason: string;
    retryHint: string | null;
  } {
    const lower = message.toLowerCase();
    if (lower.includes('enoent')) {
      return {
        errorType: 'COMMAND_NOT_FOUND',
        reason: '命令不存在',
        retryHint: `请改用允许列表命令：${ALLOWED_SHELL_COMMANDS.join(', ')}`,
      };
    }
    if (lower.includes('eacces') || lower.includes('permission denied')) {
      return {
        errorType: 'PERMISSION_DENIED',
        reason: '权限不足',
        retryHint: '请检查执行权限和目标路径权限。',
      };
    }
    return {
      errorType: 'UNKNOWN',
      reason: '进程启动失败',
      retryHint: null,
    };
  }

  private truncate(output: string): string {
    if (output.length > MAX_OUTPUT_BYTES) {
      return output.slice(0, MAX_OUTPUT_BYTES) + '\n... [输出已截断]';
    }
    return output;
  }

  private limitLines(output: string, headLimit: number | null): string {
    if (!headLimit || headLimit <= 0 || !output) return output;
    const lines = output.split('\n');
    return lines.slice(0, headLimit).join('\n');
  }

  private async tryPathPrefixAutoFix(
    command: string,
    args: string[],
    runOptions: ShellRunOptions,
    cwd: string,
    runId: string | undefined,
    result: DevExecutorOutput,
  ): Promise<DevExecutorOutput | null> {
    if (result.success || result.errorType !== 'FILE_NOT_FOUND') {
      return null;
    }
    if (!READ_ONLY_PATH_COMMANDS.has(command)) {
      return null;
    }

    const fixedArgs = this.rewriteDuplicatedScopePrefix(args, cwd);
    if (!fixedArgs) {
      return null;
    }

    this.logger.warn(
      `[shell] ${runId ? `runId=${runId} ` : ''}apply path-prefix autofix: ${JSON.stringify(args)} -> ${JSON.stringify(fixedArgs)}`,
    );

    const retried = await this.runCommandOnce(command, fixedArgs, runOptions, cwd, runId);
    const note = '已自动去除重复路径前缀并重试（例如 backend/src -> src）。';
    if (retried.success) {
      return {
        ...retried,
        content: retried.content ? `${note}\n${retried.content}` : note,
      };
    }

    return {
      ...retried,
      failureReason: [retried.failureReason, note].filter(Boolean).join('；'),
      retryHint: [retried.retryHint, `自动重试参数：${JSON.stringify(fixedArgs)}`]
        .filter(Boolean)
        .join('；'),
    };
  }

  private rewriteDuplicatedScopePrefix(args: string[], cwd: string): string[] | null {
    const scope = basename(cwd);
    if (!scope) return null;
    const prefix = `${scope}/`;
    let changed = false;

    const fixedArgs = args.map((arg) => {
      if (arg.startsWith('-')) return arg;
      if (!arg.startsWith(prefix)) return arg;

      const originalAbs = resolve(cwd, arg);
      if (existsSync(originalAbs)) return arg;

      const stripped = arg.slice(prefix.length);
      if (!stripped) return arg;
      const strippedAbs = resolve(cwd, stripped);
      if (!existsSync(strippedAbs)) return arg;

      changed = true;
      return stripped;
    });

    return changed ? fixedArgs : null;
  }
}
