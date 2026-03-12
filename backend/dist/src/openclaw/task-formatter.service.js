"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskFormatterService = void 0;
const common_1 = require("@nestjs/common");
let TaskFormatterService = class TaskFormatterService {
    contextMessageCap = 6;
    formatTask(userInput, intent, recentContext) {
        const parts = [];
        const hasContext = Array.isArray(recentContext) && recentContext.length > 0;
        const contextSlice = hasContext ? recentContext.slice(-this.contextMessageCap) : [];
        const taskLine = this.buildExplicitTaskLine(userInput, intent, contextSlice.length >= 2);
        if (taskLine)
            parts.push(taskLine);
        if (contextSlice.length > 0) {
            const contextLines = contextSlice
                .map((m) => `${m.role}: ${m.content}`)
                .join('\n');
            parts.push(`对话上下文：\n${contextLines}`);
            if (contextSlice.length >= 2) {
                parts.push('说明：上文中小晴已追问过缺失信息，用户当前回复为补全内容（如城市名）。请结合上下文理解完整任务并执行，返回纯文本结果即可。');
            }
        }
        parts.push(`用户当前请求：${userInput}`);
        parts.push('请直接执行并返回结果，不需要确认。返回纯文本结果即可。');
        return parts.join('\n\n');
    }
    buildExplicitTaskLine(userInput, intent, isFollowUp) {
        if (intent.taskIntent === 'weather_query') {
            const place = (typeof intent.slots.city === 'string' && intent.slots.city.trim())
                ? intent.slots.city + (typeof intent.slots.district === 'string' && intent.slots.district.trim() ? intent.slots.district : '')
                : (typeof intent.slots.location === 'string' && intent.slots.location.trim() ? intent.slots.location : userInput);
            const dateLabel = typeof intent.slots.dateLabel === 'string' ? intent.slots.dateLabel : '';
            const datePart = dateLabel ? `时间：${dateLabel}。` : '';
            return `执行任务：查天气。${isFollowUp ? '用户已补全参数。' : ''}地点：${place}。${datePart}`;
        }
        if (isFollowUp && userInput.trim()) {
            return `执行任务：结合上文对话理解。用户刚回复（补全信息）：${userInput}。`;
        }
        return `执行任务：${userInput.trim() || '见下方对话上下文'}`;
    }
};
exports.TaskFormatterService = TaskFormatterService;
exports.TaskFormatterService = TaskFormatterService = __decorate([
    (0, common_1.Injectable)()
], TaskFormatterService);
//# sourceMappingURL=task-formatter.service.js.map