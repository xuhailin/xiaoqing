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
var ToolExecutorRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutorRegistry = void 0;
const common_1 = require("@nestjs/common");
const capability_registry_service_1 = require("../capability-registry.service");
const openclaw_service_1 = require("../../openclaw/openclaw.service");
const EXECUTOR_TO_CAPABILITY = {
    'local-weather': 'weather',
    'local-book-download': 'book-download',
    'local-general-action': 'general-action',
    'local-timesheet': 'timesheet',
};
let ToolExecutorRegistry = ToolExecutorRegistry_1 = class ToolExecutorRegistry {
    capabilityRegistry;
    openClaw;
    logger = new common_1.Logger(ToolExecutorRegistry_1.name);
    constructor(capabilityRegistry, openClaw) {
        this.capabilityRegistry = capabilityRegistry;
        this.openClaw = openClaw;
    }
    isExecutorAvailable(executor) {
        const capName = EXECUTOR_TO_CAPABILITY[executor];
        if (capName) {
            const cap = this.capabilityRegistry.get(capName);
            return cap ? cap.isAvailable() : false;
        }
        return true;
    }
    async execute(request) {
        const capName = EXECUTOR_TO_CAPABILITY[request.executor];
        if (capName) {
            const cap = this.capabilityRegistry.get(capName);
            if (!cap) {
                return this.fail(request, `capability "${capName}" not registered`);
            }
            const result = await cap.execute({
                conversationId: request.conversationId,
                turnId: request.turnId,
                userInput: request.userInput,
                params: request.params,
                intentState: request.intentState,
            });
            return this.fromCapabilityResult(request, result);
        }
        const taskMessage = typeof request.params.taskMessage === 'string'
            ? request.params.taskMessage
            : '';
        if (!taskMessage) {
            return this.fail(request, 'openclaw taskMessage missing');
        }
        const result = await this.openClaw.delegateTask({
            message: taskMessage,
            sessionKey: request.conversationId,
        });
        return {
            conversationId: request.conversationId,
            turnId: request.turnId,
            executor: request.executor,
            capability: request.capability,
            success: result.success,
            content: result.content || null,
            error: result.error ?? null,
        };
    }
    fail(request, error) {
        return {
            conversationId: request.conversationId,
            turnId: request.turnId,
            executor: request.executor,
            capability: request.capability,
            success: false,
            content: null,
            error,
        };
    }
    fromCapabilityResult(request, result) {
        return {
            conversationId: request.conversationId,
            turnId: request.turnId,
            executor: request.executor,
            capability: request.capability,
            success: result.success,
            content: result.content,
            error: result.error,
            ...(result.meta ? { meta: result.meta } : {}),
        };
    }
};
exports.ToolExecutorRegistry = ToolExecutorRegistry;
exports.ToolExecutorRegistry = ToolExecutorRegistry = ToolExecutorRegistry_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [capability_registry_service_1.CapabilityRegistry,
        openclaw_service_1.OpenClawService])
], ToolExecutorRegistry);
//# sourceMappingURL=tool-executor-registry.service.js.map