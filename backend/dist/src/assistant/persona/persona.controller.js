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
exports.PersonaController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../infra/prisma.service");
const persona_service_1 = require("./persona.service");
const evolution_scheduler_service_1 = require("./evolution-scheduler.service");
const user_profile_service_1 = require("./user-profile.service");
let PersonaController = class PersonaController {
    persona;
    prisma;
    evolutionScheduler;
    userProfile;
    constructor(persona, prisma, evolutionScheduler, userProfile) {
        this.persona = persona;
        this.prisma = prisma;
        this.evolutionScheduler = evolutionScheduler;
        this.userProfile = userProfile;
    }
    async get() {
        return this.persona.getOrCreate();
    }
    getOptions() {
        return {
            fieldLabels: persona_service_1.PERSONA_FIELD_LABELS,
        };
    }
    async getProfile() {
        return this.userProfile.getOrCreate();
    }
    async updateProfile(body) {
        return this.userProfile.update(body);
    }
    async update(body) {
        return this.persona.update(body);
    }
    async suggestEvolution(body) {
        const msgs = await this.prisma.message.findMany({
            where: { conversationId: body.conversationId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        const recent = msgs
            .reverse()
            .map((m) => ({ role: m.role, content: m.content }));
        return this.persona.suggestEvolution(recent);
    }
    async confirmEvolution(body) {
        if (!body?.changes?.length)
            return { error: 'changes array is required' };
        return this.persona.confirmEvolution(body.changes);
    }
    async previewEvolution(body) {
        if (!body?.changes?.length)
            return { error: 'changes array is required' };
        return this.persona.previewEvolution(body.changes);
    }
    async updateImpression(body) {
        if (!body?.action || !body?.target || !body?.content) {
            return { error: 'action, target, content are required' };
        }
        return this.userProfile.updateImpression(body);
    }
    async confirmImpression(body) {
        if (body?.target !== 'core' && body?.target !== 'detail') {
            return { error: 'target must be "core" or "detail"' };
        }
        return this.userProfile.confirmPendingImpression(body.target);
    }
    async rejectImpression(body) {
        if (body?.target !== 'core' && body?.target !== 'detail') {
            return { error: 'target must be "core" or "detail"' };
        }
        return this.userProfile.rejectPendingImpression(body.target);
    }
    getPendingEvolution() {
        return this.evolutionScheduler.getPendingSuggestion();
    }
    clearPendingEvolution() {
        this.evolutionScheduler.clearPendingSuggestion();
        return { ok: true };
    }
};
exports.PersonaController = PersonaController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "get", null);
__decorate([
    (0, common_1.Get)('options'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PersonaController.prototype, "getOptions", null);
__decorate([
    (0, common_1.Get)('profile'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Patch)('profile'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Patch)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('evolve/suggest'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "suggestEvolution", null);
__decorate([
    (0, common_1.Post)('evolve/confirm'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "confirmEvolution", null);
__decorate([
    (0, common_1.Post)('evolve/preview'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "previewEvolution", null);
__decorate([
    (0, common_1.Patch)('profile/impression'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "updateImpression", null);
__decorate([
    (0, common_1.Patch)('profile/impression/confirm'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "confirmImpression", null);
__decorate([
    (0, common_1.Patch)('profile/impression/reject'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PersonaController.prototype, "rejectImpression", null);
__decorate([
    (0, common_1.Get)('evolve/pending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PersonaController.prototype, "getPendingEvolution", null);
__decorate([
    (0, common_1.Delete)('evolve/pending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PersonaController.prototype, "clearPendingEvolution", null);
exports.PersonaController = PersonaController = __decorate([
    (0, common_1.Controller)('persona'),
    __metadata("design:paramtypes", [persona_service_1.PersonaService,
        prisma_service_1.PrismaService,
        evolution_scheduler_service_1.EvolutionSchedulerService,
        user_profile_service_1.UserProfileService])
], PersonaController);
//# sourceMappingURL=persona.controller.js.map