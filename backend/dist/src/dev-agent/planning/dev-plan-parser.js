"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DevPlanParser_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevPlanParser = void 0;
const common_1 = require("@nestjs/common");
let DevPlanParser = DevPlanParser_1 = class DevPlanParser {
    logger = new common_1.Logger(DevPlanParser_1.name);
    parse(response, fallbackCommand) {
        try {
            const cleaned = this.extractJson(response);
            const parsed = JSON.parse(cleaned);
            const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
            if (steps.length === 0) {
                throw new Error('empty steps');
            }
            return {
                summary: typeof parsed.summary === 'string' ? parsed.summary : fallbackCommand,
                steps: steps,
            };
        }
        catch {
            this.logger.warn('Failed to parse LLM plan, falling back to single shell step');
            return {
                summary: fallbackCommand,
                steps: [
                    {
                        index: 1,
                        description: fallbackCommand,
                        executor: 'shell',
                        command: fallbackCommand,
                    },
                ],
            };
        }
    }
    extractJson(response) {
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
        return (jsonMatch[1] ?? response).trim();
    }
};
exports.DevPlanParser = DevPlanParser;
exports.DevPlanParser = DevPlanParser = DevPlanParser_1 = __decorate([
    (0, common_1.Injectable)()
], DevPlanParser);
//# sourceMappingURL=dev-plan-parser.js.map