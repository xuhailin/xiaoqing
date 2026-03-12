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
exports.MemoryDecayService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../infra/prisma.service");
const memory_category_1 = require("./memory-category");
let MemoryDecayService = class MemoryDecayService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    calculateDecayScore(lastAccessedAt, hitCount, config, now = new Date()) {
        const msPerDay = 86_400_000;
        const daysSinceAccess = (now.getTime() - lastAccessedAt.getTime()) / msPerDay;
        const rawDecay = Math.pow(2, -daysSinceAccess / config.halfLifeDays);
        const score = rawDecay + hitCount * config.hitBoost;
        return Math.max(0, Math.min(1, score));
    }
    async recalcAll() {
        const memories = await this.prisma.memory.findMany({
            where: { frozen: false },
            select: {
                id: true,
                category: true,
                hitCount: true,
                lastAccessedAt: true,
            },
        });
        const now = new Date();
        let updated = 0;
        for (const mem of memories) {
            const config = memory_category_1.DECAY_CONFIG[mem.category] ??
                memory_category_1.DECAY_CONFIG[memory_category_1.MemoryCategory.GENERAL];
            if (!config)
                continue;
            const newScore = this.calculateDecayScore(mem.lastAccessedAt, mem.hitCount, config, now);
            await this.prisma.memory.update({
                where: { id: mem.id },
                data: { decayScore: newScore },
            });
            updated++;
        }
        return updated;
    }
    async getDecayCandidates() {
        const memories = await this.prisma.memory.findMany({
            where: { frozen: false },
            select: {
                id: true,
                type: true,
                category: true,
                content: true,
                decayScore: true,
                hitCount: true,
                lastAccessedAt: true,
            },
            orderBy: { decayScore: 'asc' },
        });
        return memories.filter((m) => {
            const config = memory_category_1.DECAY_CONFIG[m.category] ??
                memory_category_1.DECAY_CONFIG[memory_category_1.MemoryCategory.GENERAL];
            if (!config)
                return false;
            return m.decayScore < config.minScore;
        });
    }
    async recordHit(memoryId) {
        await this.prisma.memory.update({
            where: { id: memoryId },
            data: {
                hitCount: { increment: 1 },
                lastAccessedAt: new Date(),
            },
        });
    }
    async recordHits(memoryIds) {
        if (memoryIds.length === 0)
            return;
        const now = new Date();
        await this.prisma.$transaction(memoryIds.map((id) => this.prisma.memory.update({
            where: { id },
            data: {
                hitCount: { increment: 1 },
                lastAccessedAt: now,
            },
        })));
    }
    async softDelete(memoryId) {
        await this.prisma.memory.update({
            where: { id: memoryId },
            data: { decayScore: 0, confidence: 0 },
        });
    }
    async cleanup(memoryIds) {
        if (memoryIds.length === 0)
            return 0;
        const result = await this.prisma.memory.deleteMany({
            where: { id: { in: memoryIds } },
        });
        return result.count;
    }
};
exports.MemoryDecayService = MemoryDecayService;
exports.MemoryDecayService = MemoryDecayService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MemoryDecayService);
//# sourceMappingURL=memory-decay.service.js.map