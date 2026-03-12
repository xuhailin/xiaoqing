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
exports.DevProgressEvaluator = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../infra/llm/llm.service");
const dev_agent_constants_1 = require("../dev-agent.constants");
let DevProgressEvaluator = class DevProgressEvaluator {
    llm;
    constructor(llm) {
        this.llm = llm;
    }
    async evaluateTaskProgress(goal, taskContext, options) {
        const safeGoal = String(goal ?? '').slice(0, dev_agent_constants_1.GOAL_MAX_CHARS);
        if (options.hasRemainingRoundSteps) {
            return { done: false, reason: '当前轮仍有待执行步骤。' };
        }
        const recent = taskContext.stepResults.slice(-4).map((s) => ({
            stepId: s.stepId ?? '',
            command: s.command,
            success: s.success,
            output: this.preview(s.output),
            error: s.error,
        }));
        try {
            const response = await this.llm.generate([
                {
                    role: 'system',
                    content: `你是任务完成度评估器。根据目标与最近执行结果，判断任务是否完成。
仅输出 JSON：
{"done": true/false, "reason": "一句话原因"}。`,
                },
                {
                    role: 'user',
                    content: `目标：${safeGoal}\n最近步骤：${JSON.stringify(recent, null, 2)}`,
                },
            ], { scenario: 'reasoning' });
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
            const cleaned = (jsonMatch[1] ?? response).trim();
            const parsed = JSON.parse(cleaned);
            return {
                done: parsed.done === true,
                reason: parsed.reason ?? (parsed.done ? '任务目标已满足。' : '需要下一轮小步执行。'),
            };
        }
        catch {
            return { done: false, reason: '继续下一轮 small-step 规划。' };
        }
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
exports.DevProgressEvaluator = DevProgressEvaluator;
exports.DevProgressEvaluator = DevProgressEvaluator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], DevProgressEvaluator);
//# sourceMappingURL=dev-progress-evaluator.js.map