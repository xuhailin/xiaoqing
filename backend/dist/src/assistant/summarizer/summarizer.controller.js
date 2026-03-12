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
exports.SummarizerController = void 0;
const common_1 = require("@nestjs/common");
const summarizer_service_1 = require("./summarizer.service");
const prisma_service_1 = require("../../infra/prisma.service");
const persona_service_1 = require("../persona/persona.service");
const evolution_scheduler_service_1 = require("../persona/evolution-scheduler.service");
let SummarizerController = class SummarizerController {
    summarizer;
    prisma;
    persona;
    evolutionScheduler;
    constructor(summarizer, prisma, persona, evolutionScheduler) {
        this.summarizer = summarizer;
        this.prisma = prisma;
        this.persona = persona;
        this.evolutionScheduler = evolutionScheduler;
    }
    async summarize(id, body) {
        const result = await this.summarizer.summarize(id, body?.messageIds);
        const msgs = await this.prisma.message.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        const recent = msgs.reverse().map((m) => ({ role: m.role, content: m.content }));
        const evo = await this.persona.suggestEvolution(recent);
        if (evo.changes.length > 0) {
            const isUserPref = (field) => field === 'preferredVoiceStyle'
                || field === 'praisePreference'
                || field === 'responseRhythm';
            const preferenceChanges = evo.changes.filter((c) => isUserPref(c.targetField ?? c.field));
            const personaChanges = evo.changes.filter((c) => !isUserPref(c.targetField ?? c.field));
            if (preferenceChanges.length > 0) {
                await this.persona.confirmEvolution(preferenceChanges);
            }
            if (personaChanges.length === 0)
                return result;
            this.evolutionScheduler.setPendingSuggestion({
                changes: personaChanges,
                triggerReason: '手动总结后触发',
                createdAt: new Date(),
            });
        }
        return result;
    }
};
exports.SummarizerController = SummarizerController;
__decorate([
    (0, common_1.Post)('conversations/:id/summarize'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SummarizerController.prototype, "summarize", null);
exports.SummarizerController = SummarizerController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [summarizer_service_1.SummarizerService,
        prisma_service_1.PrismaService,
        persona_service_1.PersonaService,
        evolution_scheduler_service_1.EvolutionSchedulerService])
], SummarizerController);
//# sourceMappingURL=summarizer.controller.js.map