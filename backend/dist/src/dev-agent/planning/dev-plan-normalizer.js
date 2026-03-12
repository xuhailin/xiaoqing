"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DevPlanNormalizer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevPlanNormalizer = void 0;
const common_1 = require("@nestjs/common");
const shell_command_policy_1 = require("../shell-command-policy");
const dev_agent_constants_1 = require("../dev-agent.constants");
let DevPlanNormalizer = DevPlanNormalizer_1 = class DevPlanNormalizer {
    logger = new common_1.Logger(DevPlanNormalizer_1.name);
    normalize(plan, fallbackCommand) {
        return {
            summary: plan.summary,
            steps: plan.steps
                .slice(0, dev_agent_constants_1.MAX_STEPS_PER_ROUND)
                .map((rawStep, i) => this.coerceStep(rawStep, i, fallbackCommand))
                .map((step) => this.normalizeShellStep(step, fallbackCommand)),
        };
    }
    coerceStep(rawStep, index, fallbackCommand) {
        return {
            index: rawStep.index ?? index + 1,
            description: rawStep.description ?? '',
            executor: rawStep.executor === 'openclaw'
                ? 'openclaw'
                : rawStep.executor === 'claude-code'
                    ? 'claude-code'
                    : 'shell',
            command: rawStep.command ?? fallbackCommand,
        };
    }
    normalizeShellStep(step, fallbackCommand) {
        if (step.executor !== 'shell')
            return step;
        const rawCommand = step.command?.trim() || fallbackCommand;
        const policy = (0, shell_command_policy_1.inspectShellCommand)(rawCommand);
        if (policy.allowed) {
            return { ...step, command: rawCommand };
        }
        if (policy.suggestedCommand) {
            this.logger.warn(`Plan step ${step.index} uses disallowed command "${policy.command}", auto-replaced with "${policy.suggestedCommand}"`);
            return { ...step, command: policy.suggestedCommand };
        }
        return { ...step, command: rawCommand };
    }
};
exports.DevPlanNormalizer = DevPlanNormalizer;
exports.DevPlanNormalizer = DevPlanNormalizer = DevPlanNormalizer_1 = __decorate([
    (0, common_1.Injectable)()
], DevPlanNormalizer);
//# sourceMappingURL=dev-plan-normalizer.js.map