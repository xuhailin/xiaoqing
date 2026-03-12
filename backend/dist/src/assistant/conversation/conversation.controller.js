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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationController = void 0;
const common_1 = require("@nestjs/common");
const conversation_service_1 = require("./conversation.service");
let ConversationController = class ConversationController {
    conversation;
    constructor(conversation) {
        this.conversation = conversation;
    }
    async list() {
        return this.conversation.list();
    }
    async create() {
        return this.conversation.create();
    }
    async getOrCreateCurrent() {
        return this.conversation.getOrCreateCurrent();
    }
    async getMessages(id) {
        return this.conversation.getMessages(id);
    }
    async listDailyMoments(id) {
        return this.conversation.listDailyMoments(id);
    }
    async getWorldState(id) {
        return this.conversation.getWorldState(id);
    }
    async updateWorldState(id, body) {
        return this.conversation.updateWorldState(id, body ?? {});
    }
    async getTokenStats(id) {
        return this.conversation.getTokenStats(id);
    }
    async saveDailyMomentFeedback(id, recordId, body) {
        if (!body?.feedback) {
            return { error: 'feedback is required' };
        }
        return this.conversation.saveDailyMomentFeedback(id, recordId, body.feedback);
    }
    async flushSummarize(id) {
        return this.conversation.flushSummarize(id);
    }
    async delete(id) {
        return this.conversation.delete(id);
    }
};
exports.ConversationController = ConversationController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('current'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "getOrCreateCurrent", null);
__decorate([
    (0, common_1.Get)(':id/messages'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Get)(':id/daily-moments'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "listDailyMoments", null);
__decorate([
    (0, common_1.Get)(':id/world-state'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "getWorldState", null);
__decorate([
    (0, common_1.Patch)(':id/world-state'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "updateWorldState", null);
__decorate([
    (0, common_1.Get)(':id/token-stats'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "getTokenStats", null);
__decorate([
    (0, common_1.Post)(':id/daily-moments/:recordId/feedback'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('recordId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "saveDailyMomentFeedback", null);
__decorate([
    (0, common_1.Post)(':id/flush-summarize'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "flushSummarize", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ConversationController.prototype, "delete", null);
exports.ConversationController = ConversationController = __decorate([
    (0, common_1.Controller)('conversations'),
    __metadata("design:paramtypes", [conversation_service_1.ConversationService])
], ConversationController);
//# sourceMappingURL=conversation.controller.js.map