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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevStepRunner = void 0;
const common_1 = require("@nestjs/common");
const shell_command_policy_1 = require("../shell-command-policy");
const dev_agent_constants_1 = require("../dev-agent.constants");
const dev_executor_resolver_1 = require("./dev-executor-resolver");
let DevStepRunner = class DevStepRunner {
    executorResolver;
    constructor(executorResolver) {
        this.executorResolver = executorResolver;
    }
    async executeStep(runId, sessionId, taskContext, step, stepId) {
        const start = new Date();
        const output = await this.runStepWithPreflight(runId, sessionId, step);
        const end = new Date();
        const duration = end.getTime() - start.getTime();
        const parsed = step.executor === 'shell'
            ? (0, shell_command_policy_1.parseShellCommand)(step.command)
            : { command: step.command, args: [] };
        const stdoutPreview = this.preview(output.stdout ?? (output.success ? output.content : null));
        const stderrPreview = this.preview(output.stderr ?? (!output.success ? output.error : null));
        const failureReason = output.failureReason ?? output.error ?? null;
        const result = {
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
        const log = {
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
    async runStepWithPreflight(runId, sessionId, step) {
        if (step.executor === 'shell') {
            const preflight = (0, shell_command_policy_1.inspectShellCommand)(step.command);
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
        });
    }
    preview(text) {
        if (!text)
            return null;
        const normalized = text.trim();
        if (!normalized)
            return null;
        return normalized.length > dev_agent_constants_1.PREVIEW_LIMIT
            ? `${normalized.slice(0, dev_agent_constants_1.PREVIEW_LIMIT)}...`
            : normalized;
    }
};
exports.DevStepRunner = DevStepRunner;
exports.DevStepRunner = DevStepRunner = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dev_executor_resolver_1.DevExecutorResolver])
], DevStepRunner);
//# sourceMappingURL=dev-step-runner.js.map