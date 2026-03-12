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
var EvolutionSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvolutionSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../infra/prisma.service");
const persona_service_1 = require("./persona.service");
const memory_category_1 = require("../memory/memory-category");
let EvolutionSchedulerService = EvolutionSchedulerService_1 = class EvolutionSchedulerService {
    prisma;
    persona;
    enabled;
    densityThreshold;
    logger = new common_1.Logger(EvolutionSchedulerService_1.name);
    pendingSuggestion = null;
    constructor(prisma, persona, config) {
        this.prisma = prisma;
        this.persona = persona;
        this.enabled = config.get('FEATURE_EVOLUTION_SCHEDULER') !== 'false';
        this.densityThreshold = Number(config.get('EVOLUTION_DENSITY_THRESHOLD')) || 5;
    }
    getPendingSuggestion() {
        return this.pendingSuggestion;
    }
    setPendingSuggestion(suggestion) {
        this.pendingSuggestion = suggestion;
    }
    clearPendingSuggestion() {
        this.pendingSuggestion = null;
    }
    async handleDensityCheck() {
        if (!this.enabled)
            return;
        this.logger.log('Daily evolution density check started');
        const counts = await this.prisma.memory.groupBy({
            by: ['category'],
            where: {
                category: { in: memory_category_1.COGNITIVE_CATEGORIES },
                decayScore: { gt: 0 },
                type: 'long',
            },
            _count: true,
        });
        const totalCognitive = counts.reduce((sum, c) => sum + c._count, 0);
        const denseCategories = counts
            .filter((c) => c._count >= this.densityThreshold)
            .map((c) => `${c.category}(${c._count}条)`);
        if (denseCategories.length === 0) {
            this.logger.log(`No category exceeds density threshold (${this.densityThreshold}). Total cognitive: ${totalCognitive}`);
            return;
        }
        this.logger.log(`Dense categories found: ${denseCategories.join(', ')}. Generating evolution suggestion...`);
        const recentConv = await this.prisma.conversation.findFirst({
            orderBy: { updatedAt: 'desc' },
        });
        if (!recentConv)
            return;
        const messages = await this.prisma.message.findMany({
            where: { conversationId: recentConv.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        if (messages.length === 0)
            return;
        const recentMessages = messages.reverse().map((m) => ({
            role: m.role,
            content: m.content,
        }));
        const result = await this.persona.suggestEvolution(recentMessages);
        if (result.changes.length > 0) {
            const isUserPref = (field) => field === 'preferredVoiceStyle'
                || field === 'praisePreference'
                || field === 'responseRhythm';
            const preferenceChanges = result.changes.filter((c) => isUserPref(c.targetField ?? c.field));
            const personaChanges = result.changes.filter((c) => !isUserPref(c.targetField ?? c.field));
            if (preferenceChanges.length > 0) {
                await this.persona.confirmEvolution(preferenceChanges);
            }
            if (personaChanges.length === 0) {
                this.logger.log(`Evolution suggestion auto-applied ${preferenceChanges.length} preference changes, no persona confirmation required`);
                return;
            }
            this.pendingSuggestion = {
                changes: personaChanges,
                triggerReason: `认知记忆密度触发：${denseCategories.join(', ')}`,
                createdAt: new Date(),
            };
            this.logger.log(`Evolution suggestion generated: ${personaChanges.length} persona changes pending user confirmation (${preferenceChanges.length} preference changes auto-applied)`);
        }
        else {
            this.logger.log('Evolution suggestion returned no changes');
        }
    }
};
exports.EvolutionSchedulerService = EvolutionSchedulerService;
__decorate([
    (0, schedule_1.Cron)('0 0 4 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EvolutionSchedulerService.prototype, "handleDensityCheck", null);
exports.EvolutionSchedulerService = EvolutionSchedulerService = EvolutionSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        persona_service_1.PersonaService,
        config_1.ConfigService])
], EvolutionSchedulerService);
//# sourceMappingURL=evolution-scheduler.service.js.map