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
var OpenClawExecutor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawExecutor = void 0;
const common_1 = require("@nestjs/common");
const openclaw_service_1 = require("../../openclaw/openclaw.service");
let OpenClawExecutor = OpenClawExecutor_1 = class OpenClawExecutor {
    openclaw;
    name = 'openclaw';
    taskIntent = 'openclaw_delegate';
    channels = ['dev', 'chat'];
    description = '远端 AI Agent 执行（复杂推理、代码生成等）';
    logger = new common_1.Logger(OpenClawExecutor_1.name);
    constructor(openclaw) {
        this.openclaw = openclaw;
    }
    isAvailable() {
        return this.openclaw.isAvailable();
    }
    async execute(input) {
        const message = 'params' in input && 'conversationId' in input
            ? (typeof input.params.taskMessage === 'string' ? input.params.taskMessage : input.userInput)
            : input.userInput;
        const sessionKey = 'params' in input && 'conversationId' in input
            ? input.conversationId
            : input.sessionId;
        const runId = 'runId' in input ? input.runId : undefined;
        this.logger.log(`[openclaw] ${runId ? `runId=${runId} ` : ''}delegating task`);
        const result = await this.openclaw.delegateTask({
            message,
            sessionKey,
        });
        return {
            success: result.success,
            content: result.content || null,
            error: result.error ?? null,
            errorType: result.success ? null : 'NON_ZERO_EXIT',
            exitCode: result.success ? 0 : 1,
            command: 'openclaw.delegateTask',
            args: [],
            cwd: null,
            stdout: result.content || null,
            stderr: result.error ?? null,
            durationMs: null,
            failureReason: result.success ? null : (result.error ?? 'OpenClaw 执行失败'),
            retryHint: result.success ? null : '可尝试缩小任务范围后重试。',
        };
    }
};
exports.OpenClawExecutor = OpenClawExecutor;
exports.OpenClawExecutor = OpenClawExecutor = OpenClawExecutor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openclaw_service_1.OpenClawService])
], OpenClawExecutor);
//# sourceMappingURL=openclaw.executor.js.map