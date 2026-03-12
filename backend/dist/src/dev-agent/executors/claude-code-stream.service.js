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
var ClaudeCodeStreamService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCodeStreamService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let ClaudeCodeStreamService = ClaudeCodeStreamService_1 = class ClaudeCodeStreamService {
    logger = new common_1.Logger(ClaudeCodeStreamService_1.name);
    defaultModel;
    defaultMaxTurns;
    defaultMaxBudgetUsd;
    constructor(config) {
        this.defaultModel = config.get('CLAUDE_CODE_MODEL') || 'claude-sonnet-4-6';
        this.defaultMaxTurns = parseInt(config.get('CLAUDE_CODE_MAX_TURNS') || '50', 10);
        this.defaultMaxBudgetUsd = parseFloat(config.get('CLAUDE_CODE_MAX_BUDGET_USD') || '5.0');
    }
    async execute(prompt, options = {}, onProgress) {
        const { query } = await import('@anthropic-ai/claude-agent-sdk');
        const abortController = options.abortController ?? new AbortController();
        const sdkOptions = {
            abortController,
            cwd: options.cwd || process.cwd(),
            model: options.model || this.defaultModel,
            maxTurns: options.maxTurns || this.defaultMaxTurns,
            maxBudgetUsd: options.maxBudgetUsd || this.defaultMaxBudgetUsd,
            allowedTools: options.allowedTools || [
                'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
            ],
            persistSession: false,
        };
        this.logger.log(`Starting Claude Code Agent: model=${sdkOptions.model} maxTurns=${sdkOptions.maxTurns} cwd=${sdkOptions.cwd}`);
        try {
            const stream = query({ prompt, options: sdkOptions });
            for await (const message of stream) {
                if (onProgress) {
                    this.emitProgress(message, onProgress);
                }
                if (message.type === 'result') {
                    const isSuccess = message.subtype === 'success';
                    return {
                        success: isSuccess,
                        content: isSuccess && 'result' in message ? message.result : null,
                        error: !isSuccess && 'errors' in message
                            ? message.errors?.join('\n') ?? 'Unknown error'
                            : null,
                        durationMs: message.duration_ms ?? 0,
                        costUsd: message.total_cost_usd ?? 0,
                        numTurns: message.num_turns ?? 0,
                        sessionId: message.session_id ?? null,
                        stopReason: message.stop_reason ?? null,
                    };
                }
            }
            return {
                success: false,
                content: null,
                error: 'Stream ended without result message',
                durationMs: 0,
                costUsd: 0,
                numTurns: 0,
                sessionId: null,
                stopReason: null,
            };
        }
        catch (err) {
            if (err.name === 'AbortError') {
                this.logger.warn('Claude Code Agent execution was cancelled');
                return {
                    success: false,
                    content: null,
                    error: 'Execution cancelled',
                    durationMs: 0,
                    costUsd: 0,
                    numTurns: 0,
                    sessionId: null,
                    stopReason: 'cancelled',
                };
            }
            this.logger.error(`Claude Code Agent execution failed: ${err.message}`, err.stack);
            return {
                success: false,
                content: null,
                error: err.message || 'Unknown execution error',
                durationMs: 0,
                costUsd: 0,
                numTurns: 0,
                sessionId: null,
                stopReason: 'error',
            };
        }
    }
    emitProgress(message, onProgress) {
        if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
                if (block.type === 'text') {
                    onProgress({ type: 'text', text: block.text });
                }
                else if (block.type === 'tool_use') {
                    onProgress({ type: 'tool_use', toolName: block.name });
                }
            }
        }
    }
};
exports.ClaudeCodeStreamService = ClaudeCodeStreamService;
exports.ClaudeCodeStreamService = ClaudeCodeStreamService = ClaudeCodeStreamService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ClaudeCodeStreamService);
//# sourceMappingURL=claude-code-stream.service.js.map