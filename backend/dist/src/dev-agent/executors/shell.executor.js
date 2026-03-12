"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ShellExecutor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShellExecutor = void 0;
const common_1 = require("@nestjs/common");
const child_process_1 = require("child_process");
const path_1 = require("path");
const shell_command_policy_1 = require("../shell-command-policy");
const workspace_manager_service_1 = require("../workspace/workspace-manager.service");
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 100_000;
let ShellExecutor = ShellExecutor_1 = class ShellExecutor {
    workspaceManager;
    name = 'shell';
    taskIntent = 'shell_command';
    channels = ['dev'];
    description = '本地 shell 命令执行（ls/cat/grep/git/npm 等）';
    logger = new common_1.Logger(ShellExecutor_1.name);
    projectRoot = (0, path_1.resolve)(__dirname, '../../../../..');
    constructor(workspaceManager) {
        this.workspaceManager = workspaceManager;
    }
    isAvailable() {
        return true;
    }
    async execute(input) {
        const userInput = 'params' in input && 'conversationId' in input
            ? (typeof input.params.command === 'string' ? input.params.command : input.userInput)
            : input.userInput;
        const runId = 'runId' in input ? input.runId : undefined;
        const sessionId = 'sessionId' in input ? input.sessionId : undefined;
        const cwd = await this.resolveCwd(sessionId, runId);
        const result = await this.executeCommand(userInput, cwd, runId);
        return result;
    }
    async executeCommand(userInput, cwd, runId) {
        const startAt = Date.now();
        const policy = (0, shell_command_policy_1.inspectShellCommand)(userInput);
        if (!policy.allowed) {
            const hint = policy.suggestion ? `；替代建议：${policy.suggestion}` : '';
            return {
                success: false,
                content: null,
                command: policy.command || '',
                args: policy.args,
                cwd,
                error: `命令 "${policy.command || userInput.trim()}" 不可执行（${policy.reason}）。允许的命令：${shell_command_policy_1.ALLOWED_SHELL_COMMANDS.join(', ')}${hint}`,
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
        const autoFixPlan = (0, shell_command_policy_1.planShellAutoFix)(command, args);
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
        const runOptions = {
            suppressStderr: autoFixPlan.shouldApply && autoFixPlan.suppressStderr,
            headLimit: autoFixPlan.shouldApply ? autoFixPlan.headLimit : null,
        };
        if (autoFixPlan.shouldApply) {
            this.logger.warn(`[shell] ${runId ? `runId=${runId} ` : ''}low-risk autofix applied: ${autoFixPlan.notes.join('; ') || 'args normalized'}`);
        }
        this.logger.log(`[shell] ${runId ? `runId=${runId} ` : ''}cwd=${cwd} cmd="${command}" args=${JSON.stringify(effectiveArgs)}`);
        const result = await this.runCommandOnce(command, effectiveArgs, runOptions, cwd, runId);
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
    runCommandOnce(command, args, options, cwd, runId) {
        const startAt = Date.now();
        return new Promise((resolve) => {
            const child = (0, child_process_1.execFile)(command, args, {
                cwd,
                timeout: DEFAULT_TIMEOUT_MS,
                maxBuffer: MAX_OUTPUT_BYTES,
                env: { ...process.env, NODE_ENV: 'development' },
            }, (error, stdout, stderr) => {
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
            });
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
    async resolveCwd(sessionId, runId) {
        if (!sessionId) {
            return this.projectRoot;
        }
        try {
            const workspace = await this.workspaceManager.acquire(sessionId);
            return workspace.cwd;
        }
        catch (err) {
            this.logger.warn(`[shell] ${runId ? `runId=${runId} ` : ''}workspace acquire failed, fallback to project root: ${String(err)}`);
            return this.projectRoot;
        }
    }
    classifyFailure(error, stderr, stdout, isTimeout) {
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
                retryHint: `请改用允许列表命令：${shell_command_policy_1.ALLOWED_SHELL_COMMANDS.join(', ')}`,
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
    classifySpawnFailure(message) {
        const lower = message.toLowerCase();
        if (lower.includes('enoent')) {
            return {
                errorType: 'COMMAND_NOT_FOUND',
                reason: '命令不存在',
                retryHint: `请改用允许列表命令：${shell_command_policy_1.ALLOWED_SHELL_COMMANDS.join(', ')}`,
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
    truncate(output) {
        if (output.length > MAX_OUTPUT_BYTES) {
            return output.slice(0, MAX_OUTPUT_BYTES) + '\n... [输出已截断]';
        }
        return output;
    }
    limitLines(output, headLimit) {
        if (!headLimit || headLimit <= 0 || !output)
            return output;
        const lines = output.split('\n');
        return lines.slice(0, headLimit).join('\n');
    }
};
exports.ShellExecutor = ShellExecutor;
exports.ShellExecutor = ShellExecutor = ShellExecutor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [workspace_manager_service_1.WorkspaceManager])
], ShellExecutor);
//# sourceMappingURL=shell.executor.js.map