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
exports.MemoryWriteGuardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../infra/prisma.service");
const memory_category_1 = require("./memory-category");
const memory_similarity_1 = require("./memory-similarity");
const CONFIDENCE_THRESHOLD = 0.4;
let MemoryWriteGuardService = class MemoryWriteGuardService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async evaluate(candidate) {
        if (candidate.confidence < CONFIDENCE_THRESHOLD) {
            return {
                decision: memory_category_1.WriteDecision.SKIP,
                reason: `confidence ${candidate.confidence} < threshold ${CONFIDENCE_THRESHOLD}`,
            };
        }
        if (candidate.isNegation) {
            const conflicting = await this.findConflicting(candidate.content, candidate.category);
            if (conflicting) {
                return {
                    decision: memory_category_1.WriteDecision.OVERWRITE,
                    targetMemoryId: conflicting.id,
                    reason: `negation overwrites existing memory: ${conflicting.id}`,
                };
            }
            if (candidate.category === memory_category_1.MemoryCategory.CORRECTION) {
                return {
                    decision: memory_category_1.WriteDecision.WRITE,
                    reason: 'correction with no existing conflict, write as new',
                };
            }
            return {
                decision: memory_category_1.WriteDecision.SKIP,
                reason: 'negation but no conflicting memory found',
            };
        }
        if (candidate.category === memory_category_1.MemoryCategory.GENERAL &&
            candidate.isOneOff &&
            candidate.type === 'long') {
            return {
                decision: memory_category_1.WriteDecision.SKIP,
                reason: 'one-off fact should not become long-term memory',
            };
        }
        if (candidate.category === memory_category_1.MemoryCategory.CORRECTION) {
            const conflicting = await this.findConflicting(candidate.content, undefined);
            return {
                decision: memory_category_1.WriteDecision.WRITE_AND_LINK,
                targetMemoryId: conflicting?.id,
                reason: conflicting
                    ? `correction linked to memory: ${conflicting.id}`
                    : 'correction with no existing memory to link',
            };
        }
        const duplicate = await this.findSimilar(candidate.content, candidate.category);
        if (duplicate) {
            return {
                decision: memory_category_1.WriteDecision.MERGE,
                targetMemoryId: duplicate.id,
                reason: `similar memory exists: ${duplicate.id}`,
            };
        }
        return {
            decision: memory_category_1.WriteDecision.WRITE,
            reason: 'passed all checks',
        };
    }
    async findConflicting(content, category) {
        const where = { frozen: false };
        if (category)
            where.category = category;
        const candidates = await this.prisma.memory.findMany({
            where,
            select: { id: true, content: true },
            take: 50,
            orderBy: { updatedAt: 'desc' },
        });
        const effectiveCategory = category ?? memory_category_1.MemoryCategory.GENERAL;
        const threshold = memory_category_1.CATEGORY_DUPLICATE_THRESHOLD[effectiveCategory] ??
            memory_category_1.CATEGORY_DUPLICATE_THRESHOLD[memory_category_1.MemoryCategory.GENERAL];
        let bestMatch = null;
        let bestScore = 0;
        for (const c of candidates) {
            const score = (0, memory_similarity_1.computeSimilarity)(content, c.content, effectiveCategory).finalScore;
            if (score > bestScore && score >= threshold) {
                bestScore = score;
                bestMatch = c;
            }
        }
        return bestMatch;
    }
    async findSimilar(content, category) {
        const candidates = await this.prisma.memory.findMany({
            where: { category, frozen: false },
            select: { id: true, content: true },
            take: 30,
            orderBy: { updatedAt: 'desc' },
        });
        const threshold = memory_category_1.CATEGORY_DUPLICATE_THRESHOLD[category] ??
            memory_category_1.CATEGORY_DUPLICATE_THRESHOLD[memory_category_1.MemoryCategory.GENERAL];
        let best = null;
        let bestScore = 0;
        for (const c of candidates) {
            const score = (0, memory_similarity_1.computeSimilarity)(content, c.content, category).finalScore;
            if (score > bestScore && score >= threshold) {
                bestScore = score;
                best = c;
            }
        }
        return best;
    }
};
exports.MemoryWriteGuardService = MemoryWriteGuardService;
exports.MemoryWriteGuardService = MemoryWriteGuardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MemoryWriteGuardService);
//# sourceMappingURL=memory-write-guard.service.js.map