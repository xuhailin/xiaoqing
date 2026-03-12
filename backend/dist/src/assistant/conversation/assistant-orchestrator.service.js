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
exports.AssistantOrchestrator = void 0;
const common_1 = require("@nestjs/common");
const turn_context_assembler_service_1 = require("./turn-context-assembler.service");
let AssistantOrchestrator = class AssistantOrchestrator {
    assembler;
    constructor(assembler) {
        this.assembler = assembler;
    }
    async processTurn(input) {
        const context = await this.assembler.assembleBase({
            conversationId: input.conversationId,
            userInput: input.userInput,
            userMessage: input.userMessage,
            now: new Date(),
            recentRounds: input.recentRounds,
        });
        return input.execute(context);
    }
};
exports.AssistantOrchestrator = AssistantOrchestrator;
exports.AssistantOrchestrator = AssistantOrchestrator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [turn_context_assembler_service_1.TurnContextAssembler])
], AssistantOrchestrator);
//# sourceMappingURL=assistant-orchestrator.service.js.map