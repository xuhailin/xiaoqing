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
var SkillRunner_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillRunner = void 0;
const common_1 = require("@nestjs/common");
const capability_registry_service_1 = require("../capability-registry.service");
const skill_registry_service_1 = require("./skill-registry.service");
let SkillRunner = SkillRunner_1 = class SkillRunner {
    skillRegistry;
    capabilityRegistry;
    logger = new common_1.Logger(SkillRunner_1.name);
    constructor(skillRegistry, capabilityRegistry) {
        this.skillRegistry = skillRegistry;
        this.capabilityRegistry = capabilityRegistry;
    }
    async run(request) {
        const startedAt = new Date();
        const startedAtIso = startedAt.toISOString();
        const skill = this.skillRegistry.get(request.skill);
        if (!skill) {
            const summary = `Unknown local skill: ${request.skill}`;
            return {
                skill: request.skill,
                success: false,
                summary,
                steps: [],
                startedAt: startedAtIso,
                durationMs: Date.now() - startedAt.getTime(),
            };
        }
        const steps = [];
        let success = true;
        for (let i = 0; i < skill.steps.length; i++) {
            const step = skill.steps[i];
            const stepStart = Date.now();
            if (!skill.capabilityAllowlist.includes(step.capability)) {
                steps.push({
                    index: i + 1,
                    id: step.id,
                    capability: step.capability,
                    request: step.request,
                    success: false,
                    content: null,
                    error: `capability "${step.capability}" is not allowed for skill "${skill.name}"`,
                    durationMs: Date.now() - stepStart,
                });
                success = false;
                break;
            }
            const capability = this.capabilityRegistry.get(step.capability);
            if (!capability) {
                steps.push({
                    index: i + 1,
                    id: step.id,
                    capability: step.capability,
                    request: step.request,
                    success: false,
                    content: null,
                    error: `capability "${step.capability}" is not registered`,
                    durationMs: Date.now() - stepStart,
                });
                success = false;
                break;
            }
            if (!capability.isAvailable()) {
                steps.push({
                    index: i + 1,
                    id: step.id,
                    capability: step.capability,
                    request: step.request,
                    success: false,
                    content: null,
                    error: `capability "${step.capability}" is not available`,
                    durationMs: Date.now() - stepStart,
                });
                success = false;
                break;
            }
            let result;
            try {
                result = await capability.execute({
                    conversationId: request.conversationId,
                    turnId: request.turnId,
                    userInput: request.userInput,
                    params: step.request,
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Local skill step failed: skill=${skill.name}, step=${step.id}, capability=${step.capability}, error=${message}`);
                steps.push({
                    index: i + 1,
                    id: step.id,
                    capability: step.capability,
                    request: step.request,
                    success: false,
                    content: null,
                    error: message,
                    durationMs: Date.now() - stepStart,
                });
                success = false;
                break;
            }
            steps.push({
                index: i + 1,
                id: step.id,
                capability: step.capability,
                request: step.request,
                success: result.success,
                content: result.content,
                error: result.error,
                durationMs: Date.now() - stepStart,
                ...(result.meta ? { meta: result.meta } : {}),
            });
            if (!result.success) {
                success = false;
                break;
            }
        }
        return {
            skill: skill.name,
            success,
            summary: skill.summarize({ steps, success }),
            steps,
            startedAt: startedAtIso,
            durationMs: Date.now() - startedAt.getTime(),
        };
    }
};
exports.SkillRunner = SkillRunner;
exports.SkillRunner = SkillRunner = SkillRunner_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [skill_registry_service_1.SkillRegistry,
        capability_registry_service_1.CapabilityRegistry])
], SkillRunner);
//# sourceMappingURL=skill-runner.service.js.map