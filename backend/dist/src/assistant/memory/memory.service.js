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
exports.MemoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../infra/prisma.service");
const memory_category_1 = require("./memory-category");
let MemoryService = class MemoryService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(type, category) {
        const where = {};
        if (type)
            where.type = type;
        if (category)
            where.category = category;
        return this.prisma.memory.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    }
    async getOne(id) {
        return this.prisma.memory.findUnique({
            where: { id },
        });
    }
    async update(id, data) {
        return this.prisma.memory.update({
            where: { id },
            data: {
                ...(data.content !== undefined && { content: data.content }),
                ...(data.confidence !== undefined && { confidence: data.confidence }),
                ...(data.sourceMessageIds !== undefined && {
                    sourceMessageIds: data.sourceMessageIds,
                }),
            },
        });
    }
    async deleteOne(id) {
        return this.prisma.memory.delete({
            where: { id },
        });
    }
    async create(data) {
        const category = data.category ?? memory_category_1.MemoryCategory.GENERAL;
        const frozen = data.frozen ?? category === memory_category_1.MemoryCategory.IDENTITY_ANCHOR;
        return this.prisma.memory.create({
            data: {
                type: data.type,
                category,
                content: data.content,
                sourceMessageIds: data.sourceMessageIds ?? [],
                confidence: data.confidence ?? 1,
                frozen,
                correctedMemoryId: data.correctedMemoryId,
            },
        });
    }
    async getExistingCognitiveMemories() {
        const list = await this.prisma.memory.findMany({
            where: {
                type: 'long',
                category: { in: memory_category_1.COGNITIVE_CATEGORIES },
                decayScore: { gt: 0 },
            },
            select: { id: true, content: true },
            orderBy: { updatedAt: 'desc' },
            take: 80,
        });
        return list;
    }
    async findByCategory(category) {
        if (!memory_category_1.VALID_CATEGORIES.includes(category))
            return [];
        return this.prisma.memory.findMany({
            where: { category },
            orderBy: { createdAt: 'desc' },
        });
    }
    async bumpConfidence(id, delta) {
        const mem = await this.prisma.memory.findUnique({
            where: { id },
            select: { confidence: true },
        });
        if (!mem)
            return null;
        const next = Math.min(1, mem.confidence + delta);
        await this.prisma.memory.update({
            where: { id },
            data: { confidence: next, lastAccessedAt: new Date() },
        });
        return { id, confidence: next };
    }
    async mergeInto(targetId, additionalContent, newSourceMessageIds) {
        const target = await this.prisma.memory.findUnique({
            where: { id: targetId },
        });
        if (!target)
            return null;
        const mergedContent = `${target.content}\n${additionalContent}`;
        const mergedSources = [
            ...new Set([...target.sourceMessageIds, ...newSourceMessageIds]),
        ];
        return this.prisma.memory.update({
            where: { id: targetId },
            data: {
                content: mergedContent,
                sourceMessageIds: mergedSources,
                hitCount: { increment: 1 },
                lastAccessedAt: new Date(),
            },
        });
    }
    extractKeywords(text) {
        const keywords = new Set();
        const tokens = text
            .toLowerCase()
            .split(/[\s！？，。、；：""''【】《》（）\-_.,!?;:'"()[\]{}]+/)
            .filter(Boolean);
        for (const token of tokens) {
            if (token.length === 0)
                continue;
            const isCjk = /[\u4e00-\u9fff\u3040-\u30ff]/.test(token);
            if (isCjk) {
                for (let i = 0; i < token.length - 1; i++) {
                    keywords.add(token.slice(i, i + 2));
                }
                if (token.length === 1)
                    keywords.add(token);
            }
            else {
                if (token.length >= 2)
                    keywords.add(token);
            }
        }
        return keywords;
    }
    keywordOverlapScore(queryKws, text) {
        const textKws = this.extractKeywords(text);
        if (queryKws.size === 0 || textKws.size === 0)
            return 0;
        let overlap = 0;
        for (const kw of queryKws) {
            if (textKws.has(kw))
                overlap++;
        }
        const union = new Set([...queryKws, ...textKws]).size;
        return overlap / union;
    }
    async getCandidatesForRecall(opts) {
        const maxLong = opts.maxLong ?? 15;
        const maxMid = opts.maxMid ?? 20;
        const minRelevanceScore = opts.minRelevanceScore ?? 0.05;
        const contextText = opts.recentMessages
            .filter((m) => m.role === 'user')
            .slice(-5)
            .map((m) => m.content)
            .join(' ');
        const queryKws = this.extractKeywords(contextText);
        const [longList, midList] = await Promise.all([
            this.prisma.memory.findMany({
                where: {
                    type: 'long',
                    decayScore: { gt: 0 },
                },
                orderBy: { confidence: 'desc' },
                take: maxLong * 2,
            }),
            this.prisma.memory.findMany({
                where: {
                    type: 'mid',
                    decayScore: { gt: 0 },
                },
                orderBy: [{ createdAt: 'desc' }, { confidence: 'desc' }],
                take: maxMid,
            }),
        ]);
        const scoredLong = longList
            .map((m) => {
            const kwScore = this.keywordOverlapScore(queryKws, m.content);
            const catWeight = memory_category_1.CATEGORY_RECALL_WEIGHT[m.category] ??
                memory_category_1.CATEGORY_RECALL_WEIGHT[memory_category_1.MemoryCategory.GENERAL];
            const baseScore = 0.6 * m.confidence + 0.4 * kwScore;
            const score = baseScore * catWeight * m.decayScore;
            return {
                id: m.id,
                type: m.type,
                category: m.category,
                content: m.content,
                shortSummary: m.shortSummary,
                confidence: m.confidence,
                score,
                deferred: kwScore < minRelevanceScore,
            };
        })
            .sort((a, b) => b.score - a.score)
            .slice(0, maxLong);
        const total = midList.length;
        const scoredMid = midList.map((m, idx) => {
            const kwScore = this.keywordOverlapScore(queryKws, m.content);
            const timeDecay = total > 1 ? 1 - idx / (total - 1) : 1;
            const catWeight = memory_category_1.CATEGORY_RECALL_WEIGHT[m.category] ??
                memory_category_1.CATEGORY_RECALL_WEIGHT[memory_category_1.MemoryCategory.GENERAL];
            const baseScore = 0.4 * m.confidence + 0.3 * timeDecay + 0.3 * kwScore;
            const score = baseScore * catWeight * m.decayScore;
            return {
                id: m.id,
                type: m.type,
                category: m.category,
                content: m.content,
                shortSummary: m.shortSummary,
                confidence: m.confidence,
                score,
                deferred: false,
            };
        });
        return [...scoredMid, ...scoredLong];
    }
    async getRelatedMemories(recalledIds, maxRelated = 5) {
        if (recalledIds.length === 0)
            return [];
        const recalled = await this.prisma.memory.findMany({
            where: { id: { in: recalledIds } },
            select: { id: true, category: true, content: true },
        });
        if (recalled.length === 0)
            return [];
        const combinedKws = new Set();
        const categories = new Set();
        for (const m of recalled) {
            categories.add(m.category);
            for (const kw of this.extractKeywords(m.content)) {
                combinedKws.add(kw);
            }
        }
        const candidates = await this.prisma.memory.findMany({
            where: {
                id: { notIn: recalledIds },
                category: { in: [...categories] },
                decayScore: { gt: 0 },
            },
            take: maxRelated * 3,
        });
        const scored = candidates
            .map((m) => {
            const kwScore = this.keywordOverlapScore(combinedKws, m.content);
            const catWeight = memory_category_1.CATEGORY_RECALL_WEIGHT[m.category] ??
                memory_category_1.CATEGORY_RECALL_WEIGHT[memory_category_1.MemoryCategory.GENERAL];
            return {
                id: m.id,
                type: m.type,
                category: m.category,
                content: m.content,
                shortSummary: m.shortSummary,
                confidence: m.confidence,
                score: kwScore * catWeight * m.decayScore,
                deferred: false,
            };
        })
            .filter((m) => m.score > 0.02)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxRelated);
        return scored;
    }
    async getForInjection(midK) {
        const [midList, longList] = await Promise.all([
            this.prisma.memory.findMany({
                where: { type: 'mid' },
                orderBy: { createdAt: 'desc' },
                take: midK,
            }),
            this.prisma.memory.findMany({
                where: { type: 'long' },
                orderBy: { createdAt: 'asc' },
            }),
        ]);
        const orderedMid = midList.reverse();
        return [
            ...orderedMid.map((m) => ({ id: m.id, type: m.type, content: m.content })),
            ...longList.map((m) => ({ id: m.id, type: m.type, content: m.content })),
        ];
    }
};
exports.MemoryService = MemoryService;
exports.MemoryService = MemoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MemoryService);
//# sourceMappingURL=memory.service.js.map