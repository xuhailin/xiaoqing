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
var MemorySchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemorySchedulerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../infra/prisma.service");
const memory_decay_service_1 = require("./memory-decay.service");
let MemorySchedulerService = MemorySchedulerService_1 = class MemorySchedulerService {
    prisma;
    decay;
    enabled;
    promoteMinHits;
    promoteMinAgeDays;
    demoteInactiveDays;
    logger = new common_1.Logger(MemorySchedulerService_1.name);
    constructor(prisma, decay, config) {
        this.prisma = prisma;
        this.decay = decay;
        this.enabled = config.get('FEATURE_MEMORY_SCHEDULER') !== 'false';
        this.promoteMinHits = Number(config.get('MEMORY_PROMOTE_MIN_HITS')) || 5;
        this.promoteMinAgeDays = Number(config.get('MEMORY_PROMOTE_MIN_AGE_DAYS')) || 7;
        this.demoteInactiveDays = Number(config.get('MEMORY_DEMOTE_INACTIVE_DAYS')) || 30;
    }
    async handleDecayRecalc() {
        if (!this.enabled)
            return;
        this.logger.log('Daily decay recalculation started');
        const updated = await this.decay.recalcAll();
        this.logger.log(`Decay recalculated: ${updated} memories updated`);
        const candidates = await this.decay.getDecayCandidates();
        if (candidates.length > 0) {
            for (const c of candidates) {
                await this.decay.softDelete(c.id);
            }
            this.logger.log(`Soft-deleted ${candidates.length} decayed memories`);
        }
    }
    async handlePromotionCheck() {
        if (!this.enabled)
            return;
        this.logger.log('Daily promotion/demotion check started');
        const candidates = await this.getPromotionCandidates();
        if (candidates.length > 0) {
            let promoted = 0;
            let demoted = 0;
            for (const c of candidates) {
                const newType = c.direction === 'promote' ? 'long' : 'mid';
                await this.prisma.memory.update({
                    where: { id: c.id },
                    data: { type: newType },
                });
                if (c.direction === 'promote')
                    promoted++;
                else
                    demoted++;
            }
            this.logger.log(`Promotion/demotion complete: ${promoted} promoted (mid→long), ${demoted} demoted (long→mid)`);
        }
    }
    async getPromotionCandidates() {
        const now = new Date();
        const msPerDay = 86_400_000;
        const candidates = [];
        const promoteCandidates = await this.prisma.memory.findMany({
            where: {
                type: 'mid',
                hitCount: { gte: this.promoteMinHits },
                frozen: false,
                decayScore: { gt: 0 },
            },
            select: {
                id: true, type: true, category: true, content: true,
                hitCount: true, createdAt: true, lastAccessedAt: true,
            },
        });
        for (const m of promoteCandidates) {
            const ageDays = (now.getTime() - m.createdAt.getTime()) / msPerDay;
            if (ageDays >= this.promoteMinAgeDays) {
                candidates.push({
                    id: m.id,
                    type: m.type,
                    category: m.category,
                    content: m.content,
                    hitCount: m.hitCount,
                    createdAt: m.createdAt,
                    direction: 'promote',
                    reason: `hitCount=${m.hitCount} (≥${this.promoteMinHits}), age=${Math.floor(ageDays)}d (≥${this.promoteMinAgeDays}d)`,
                });
            }
        }
        const demoteThreshold = new Date(now.getTime() - this.demoteInactiveDays * msPerDay);
        const demoteCandidates = await this.prisma.memory.findMany({
            where: {
                type: 'long',
                frozen: false,
                decayScore: { gt: 0 },
                lastAccessedAt: { lt: demoteThreshold },
            },
            select: {
                id: true, type: true, category: true, content: true,
                hitCount: true, createdAt: true, lastAccessedAt: true,
            },
        });
        for (const m of demoteCandidates) {
            const inactiveDays = Math.floor((now.getTime() - m.lastAccessedAt.getTime()) / msPerDay);
            candidates.push({
                id: m.id,
                type: m.type,
                category: m.category,
                content: m.content,
                hitCount: m.hitCount,
                createdAt: m.createdAt,
                direction: 'demote',
                reason: `inactive ${inactiveDays}d (≥${this.demoteInactiveDays}d)`,
            });
        }
        return candidates;
    }
};
exports.MemorySchedulerService = MemorySchedulerService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_3AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MemorySchedulerService.prototype, "handleDecayRecalc", null);
__decorate([
    (0, schedule_1.Cron)('0 30 3 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MemorySchedulerService.prototype, "handlePromotionCheck", null);
exports.MemorySchedulerService = MemorySchedulerService = MemorySchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        memory_decay_service_1.MemoryDecayService,
        config_1.ConfigService])
], MemorySchedulerService);
//# sourceMappingURL=memory-scheduler.service.js.map