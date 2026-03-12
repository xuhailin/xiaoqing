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
var ClaudeCodeExecutor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCodeExecutor = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const claude_code_stream_service_1 = require("./claude-code-stream.service");
const workspace_manager_service_1 = require("../workspace/workspace-manager.service");
let ClaudeCodeExecutor = ClaudeCodeExecutor_1 = class ClaudeCodeExecutor {
    streamService;
    workspaceManager;
    name = 'claude-code';
    taskIntent = 'claude_code_agent';
    channels = ['dev'];
    description = 'Claude Code Agent 自主编码（代码生成/修改/重构/bug 修复）';
    logger = new common_1.Logger(ClaudeCodeExecutor_1.name);
    enabled;
    projectRoot;
    activeAbortControllers = new Map();
    constructor(streamService, workspaceManager, config) {
        this.streamService = streamService;
        this.workspaceManager = workspaceManager;
        this.enabled = config.get('FEATURE_CLAUDE_CODE') === 'true';
        this.projectRoot = config.get('CLAUDE_CODE_PROJECT_ROOT') || process.cwd();
    }
    isAvailable() {
        return this.enabled;
    }
    async execute(input) {
        const userInput = 'params' in input && 'conversationId' in input
            ? (typeof input.params.taskMessage === 'string' ? input.params.taskMessage : '')
            : input.userInput;
        const runId = 'runId' in input ? input.runId : 'unknown';
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
        const sessionId = 'sessionId' in input ? input.sessionId : 'unknown';
        const abortController = new AbortController();
        this.activeAbortControllers.set(runId, abortController);
        const startTime = Date.now();
        try {
            const workspace = await this.workspaceManager.acquire(sessionId);
            const cwd = workspace.cwd;
            this.logger.log(`[claude-code] runId=${runId} workspace: strategy=${workspace.strategy} cwd=${cwd}`);
            const result = await this.streamService.execute(userInput, {
                cwd,
                abortController,
            });
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
        }
        finally {
            this.activeAbortControllers.delete(runId);
        }
    }
    cancel(runId) {
        const controller = this.activeAbortControllers.get(runId);
        if (controller) {
            controller.abort();
            this.activeAbortControllers.delete(runId);
            this.logger.log(`[claude-code] runId=${runId} execution cancelled`);
            return true;
        }
        return false;
    }
    classifyError(result) {
        if (result.stopReason === 'cancelled')
            return 'TIMEOUT';
        if (result.error?.includes('rate_limit'))
            return 'TIMEOUT';
        if (result.error?.includes('authentication'))
            return 'PERMISSION_DENIED';
        return 'NON_ZERO_EXIT';
    }
};
exports.ClaudeCodeExecutor = ClaudeCodeExecutor;
exports.ClaudeCodeExecutor = ClaudeCodeExecutor = ClaudeCodeExecutor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [claude_code_stream_service_1.ClaudeCodeStreamService,
        workspace_manager_service_1.WorkspaceManager,
        config_1.ConfigService])
], ClaudeCodeExecutor);
//# sourceMappingURL=claude-code.executor.js.map