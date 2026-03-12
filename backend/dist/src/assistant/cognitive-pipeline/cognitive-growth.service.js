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
var CognitiveGrowthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitiveGrowthService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../../infra/prisma.service");
const memory_category_1 = require("../memory/memory-category");
let CognitiveGrowthService = class CognitiveGrowthService {
    static { CognitiveGrowthService_1 = this; }
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getGrowthContext() {
        const [profiles, judgmentPatterns, valuePriorities, rhythmPatterns, relationships, boundaries] = await Promise.all([
            this.prisma.$queryRaw `
        SELECT "content"
        FROM "CognitiveProfile"
        WHERE "isActive" = true AND "status" = 'confirmed'
        ORDER BY "updatedAt" DESC
        LIMIT 6
      `,
            this.prisma.memory.findMany({
                where: {
                    type: 'long',
                    category: memory_category_1.MemoryCategory.JUDGMENT_PATTERN,
                    decayScore: { gt: 0 },
                },
                select: { content: true },
                orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
                take: 4,
            }),
            this.prisma.memory.findMany({
                where: {
                    type: 'long',
                    category: memory_category_1.MemoryCategory.VALUE_PRIORITY,
                    decayScore: { gt: 0 },
                },
                select: { content: true },
                orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
                take: 4,
            }),
            this.prisma.memory.findMany({
                where: {
                    type: 'long',
                    category: memory_category_1.MemoryCategory.RHYTHM_PATTERN,
                    decayScore: { gt: 0 },
                },
                select: { content: true },
                orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
                take: 4,
            }),
            this.prisma.$queryRaw `
        SELECT "summary"
        FROM "RelationshipState"
        WHERE "isActive" = true AND "status" = 'confirmed'
        ORDER BY "updatedAt" DESC
        LIMIT 2
      `,
            this.prisma.$queryRaw `
        SELECT "note"
        FROM "BoundaryEvent"
        ORDER BY "createdAt" DESC
        LIMIT 5
      `,
        ]);
        const unique = (items, limit) => {
            const result = [];
            const seen = new Set();
            for (const raw of items) {
                const item = raw?.trim();
                if (!item)
                    continue;
                const key = item.toLowerCase();
                if (seen.has(key))
                    continue;
                seen.add(key);
                result.push(item);
                if (result.length >= limit)
                    break;
            }
            return result;
        };
        const context = {
            cognitiveProfiles: unique(profiles.map((row) => row.content), 6),
            judgmentPatterns: unique(judgmentPatterns.map((row) => row.content), 4),
            valuePriorities: unique(valuePriorities.map((row) => row.content), 4),
            rhythmPatterns: unique(rhythmPatterns.map((row) => row.content), 4),
            relationshipNotes: unique(relationships.map((row) => row.summary), 2),
            boundaryNotes: unique(boundaries.map((row) => row.note), 5),
        };
        await this.checkStagePromotion();
        return context;
    }
    async recordTurnGrowth(turnState, sourceMessageIds) {
        if (sourceMessageIds.length === 0)
            return;
        if (turnState.userModelDelta.shouldWriteCognitive) {
            const content = this.buildCognitiveProfileNote(turnState);
            await this.writeOrBumpProfile(this.resolveProfileKind(turnState), content, sourceMessageIds, 0.72);
        }
        if (turnState.userModelDelta.shouldWriteRelationship) {
            await this.writeRelationshipState(turnState, sourceMessageIds);
        }
        if (turnState.safety.notes.length > 0) {
            const content = this.buildBoundaryNote(turnState);
            await this.writeBoundaryEvent(content, sourceMessageIds, turnState.safety.relationalBoundaryRisk ? 'warn' : 'info');
        }
    }
    async getPending() {
        const [profiles, relationships] = await Promise.all([
            this.prisma.$queryRaw `
        SELECT "id", "kind", "content", "status", "sourceMessageIds", "createdAt"
        FROM "CognitiveProfile"
        WHERE "status" = 'pending' AND "isActive" = true
        ORDER BY "createdAt" DESC
        LIMIT 20
      `,
            this.prisma.$queryRaw `
        SELECT "id", "stage", "summary", "status", "sourceMessageIds", "createdAt"
        FROM "RelationshipState"
        WHERE "status" = 'pending' AND "isActive" = true
        ORDER BY "createdAt" DESC
        LIMIT 10
      `,
        ]);
        const items = [
            ...profiles.map((p) => ({
                id: p.id,
                type: 'cognitive_profile',
                content: p.content,
                kind: p.kind,
                status: p.status,
                sourceMessageIds: p.sourceMessageIds,
                createdAt: p.createdAt,
            })),
            ...relationships.map((r) => ({
                id: r.id,
                type: 'relationship_state',
                content: r.summary,
                stage: r.stage,
                status: r.status,
                sourceMessageIds: r.sourceMessageIds,
                createdAt: r.createdAt,
            })),
        ];
        return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    async confirmGrowth(id, type) {
        if (type === 'cognitive_profile') {
            await this.prisma.$executeRaw `
        UPDATE "CognitiveProfile"
        SET "status" = 'confirmed', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "status" = 'pending'
      `;
        }
        else {
            await this.prisma.$executeRaw `
        UPDATE "RelationshipState"
        SET "status" = 'confirmed', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "status" = 'pending'
      `;
        }
    }
    async rejectGrowth(id, type) {
        if (type === 'cognitive_profile') {
            await this.prisma.$executeRaw `
        UPDATE "CognitiveProfile"
        SET "status" = 'rejected', "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "status" = 'pending'
      `;
        }
        else {
            await this.prisma.$executeRaw `
        UPDATE "RelationshipState"
        SET "status" = 'rejected', "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "status" = 'pending'
      `;
        }
    }
    async cleanupGrowthForDeletedMessages(messageIds) {
        if (messageIds.length === 0) {
            return {
                archivedProfiles: 0,
                weakenedProfiles: 0,
                archivedRelationships: 0,
                weakenedRelationships: 0,
                deletedBoundaryEvents: 0,
                weakenedBoundaryEvents: 0,
            };
        }
        const [profiles, relationships, boundaries] = await Promise.all([
            this.prisma.cognitiveProfile.findMany({
                where: { sourceMessageIds: { hasSome: messageIds } },
                select: {
                    id: true,
                    status: true,
                    isActive: true,
                    confidence: true,
                    hitCount: true,
                    sourceMessageIds: true,
                },
            }),
            this.prisma.relationshipState.findMany({
                where: { sourceMessageIds: { hasSome: messageIds } },
                select: {
                    id: true,
                    status: true,
                    isActive: true,
                    trustScore: true,
                    closenessScore: true,
                    hitCount: true,
                    sourceMessageIds: true,
                },
            }),
            this.prisma.boundaryEvent.findMany({
                where: { sourceMessageIds: { hasSome: messageIds } },
                select: { id: true, sourceMessageIds: true },
            }),
        ]);
        let archivedProfiles = 0;
        let weakenedProfiles = 0;
        for (const profile of profiles) {
            const remainingSources = profile.sourceMessageIds.filter((id) => !messageIds.includes(id));
            const hasRemainingSources = remainingSources.length > 0;
            await this.prisma.cognitiveProfile.update({
                where: { id: profile.id },
                data: {
                    sourceMessageIds: remainingSources,
                    confidence: Math.max(0.1, profile.confidence - (hasRemainingSources ? 0.1 : 0.2)),
                    hitCount: Math.max(0, profile.hitCount - 1),
                    ...(hasRemainingSources
                        ? {}
                        : {
                            isActive: false,
                            status: profile.status === 'pending' ? 'rejected' : profile.status,
                        }),
                },
            });
            if (hasRemainingSources)
                weakenedProfiles++;
            else
                archivedProfiles++;
        }
        let archivedRelationships = 0;
        let weakenedRelationships = 0;
        for (const relationship of relationships) {
            const remainingSources = relationship.sourceMessageIds.filter((id) => !messageIds.includes(id));
            const hasRemainingSources = remainingSources.length > 0;
            await this.prisma.relationshipState.update({
                where: { id: relationship.id },
                data: {
                    sourceMessageIds: remainingSources,
                    trustScore: Math.max(0.1, relationship.trustScore - (hasRemainingSources ? 0.05 : 0.12)),
                    closenessScore: Math.max(0.1, relationship.closenessScore - (hasRemainingSources ? 0.05 : 0.12)),
                    hitCount: Math.max(0, relationship.hitCount - 1),
                    ...(hasRemainingSources
                        ? {}
                        : {
                            isActive: false,
                            status: relationship.status === 'pending' ? 'rejected' : relationship.status,
                        }),
                },
            });
            if (hasRemainingSources)
                weakenedRelationships++;
            else
                archivedRelationships++;
        }
        let deletedBoundaryEvents = 0;
        let weakenedBoundaryEvents = 0;
        for (const boundary of boundaries) {
            const remainingSources = boundary.sourceMessageIds.filter((id) => !messageIds.includes(id));
            if (remainingSources.length === 0) {
                await this.prisma.boundaryEvent.delete({ where: { id: boundary.id } });
                deletedBoundaryEvents++;
                continue;
            }
            await this.prisma.boundaryEvent.update({
                where: { id: boundary.id },
                data: { sourceMessageIds: remainingSources },
            });
            weakenedBoundaryEvents++;
        }
        return {
            archivedProfiles,
            weakenedProfiles,
            archivedRelationships,
            weakenedRelationships,
            deletedBoundaryEvents,
            weakenedBoundaryEvents,
        };
    }
    static PROMOTION_THRESHOLDS = {
        early_to_familiar: { trustScore: 0.6, closenessScore: 0.5, hitCount: 10 },
        familiar_to_steady: { trustScore: 0.75, closenessScore: 0.7, hitCount: 20 },
    };
    async checkStagePromotion() {
        const current = await this.prisma.$queryRaw `
      SELECT "id", "stage", "trustScore", "closenessScore", "hitCount"
      FROM "RelationshipState"
      WHERE "isActive" = true AND "status" = 'confirmed'
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;
        if (current.length === 0)
            return;
        const { stage, trustScore, closenessScore, hitCount } = current[0];
        let nextStage = null;
        let threshold = null;
        if (stage === 'early') {
            threshold = CognitiveGrowthService_1.PROMOTION_THRESHOLDS.early_to_familiar;
            if (trustScore >= threshold.trustScore &&
                closenessScore >= threshold.closenessScore &&
                hitCount >= threshold.hitCount) {
                nextStage = 'familiar';
            }
        }
        else if (stage === 'familiar') {
            threshold = CognitiveGrowthService_1.PROMOTION_THRESHOLDS.familiar_to_steady;
            if (trustScore >= threshold.trustScore &&
                closenessScore >= threshold.closenessScore &&
                hitCount >= threshold.hitCount) {
                nextStage = 'steady';
            }
        }
        if (!nextStage)
            return;
        const existingPending = await this.prisma.$queryRaw `
      SELECT "id"
      FROM "RelationshipState"
      WHERE "isActive" = true AND "status" = 'pending' AND "stage" = ${nextStage}
      LIMIT 1
    `;
        if (existingPending.length > 0)
            return;
        const summary = `信任(${trustScore.toFixed(2)})与亲密度(${closenessScore.toFixed(2)})积累充分，建议从 ${stage} 晋升至 ${nextStage}`;
        await this.prisma.$executeRaw `
      INSERT INTO "RelationshipState" (
        "id", "stage", "summary", "trustScore", "closenessScore",
        "boundaryNotes", "sourceMessageIds",
        "hitCount", "version", "isActive", "status",
        "createdAt", "updatedAt"
      )
      VALUES (
        ${(0, node_crypto_1.randomUUID)()}, ${nextStage}, ${summary},
        ${trustScore}, ${closenessScore},
        ARRAY[]::TEXT[], ARRAY[]::TEXT[],
        0, 1, true, 'pending',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;
    }
    async writeOrBumpProfile(kind, content, sourceMessageIds, confidence) {
        const existing = await this.prisma.$queryRaw `
      SELECT "id", "status"
      FROM "CognitiveProfile"
      WHERE "isActive" = true
        AND "kind" = ${kind}
        AND "content" = ${content}
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;
        if (existing.length > 0) {
            await this.prisma.$executeRaw `
        UPDATE "CognitiveProfile"
        SET
          "confidence" = LEAST(1, "confidence" + 0.05),
          "hitCount" = "hitCount" + 1,
          "lastAppliedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${existing[0].id}
      `;
            return;
        }
        await this.prisma.$executeRaw `
      INSERT INTO "CognitiveProfile" (
        "id",
        "kind",
        "content",
        "confidence",
        "sourceMessageIds",
        "hitCount",
        "lastAppliedAt",
        "isActive",
        "status",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${(0, node_crypto_1.randomUUID)()},
        ${kind},
        ${content},
        ${confidence},
        ${this.toTextArray(sourceMessageIds)},
        1,
        CURRENT_TIMESTAMP,
        true,
        'pending',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;
    }
    async writeRelationshipState(turnState, sourceMessageIds) {
        const summary = this.buildRelationshipNote(turnState);
        const current = await this.prisma.$queryRaw `
      SELECT "id", "version", "stage", "summary", "trustScore", "closenessScore", "status"
      FROM "RelationshipState"
      WHERE "isActive" = true
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;
        const nextTrust = this.computeNextTrust(turnState, current[0]?.trustScore);
        const nextCloseness = this.computeNextCloseness(turnState, current[0]?.closenessScore);
        if (current.length > 0 &&
            current[0].stage === turnState.relationship.stage &&
            current[0].summary === summary) {
            await this.prisma.$executeRaw `
        UPDATE "RelationshipState"
        SET
          "trustScore" = ${nextTrust},
          "closenessScore" = ${nextCloseness},
          "sourceMessageIds" = ${this.toTextArray(sourceMessageIds)},
          "hitCount" = "hitCount" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${current[0].id}
      `;
            return;
        }
        if (current.length > 0) {
            await this.prisma.$executeRaw `
        UPDATE "RelationshipState"
        SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${current[0].id}
      `;
        }
        await this.prisma.$executeRaw `
      INSERT INTO "RelationshipState" (
        "id",
        "stage",
        "summary",
        "trustScore",
        "closenessScore",
        "rhythmHint",
        "boundaryNotes",
        "sourceMessageIds",
        "hitCount",
        "version",
        "isActive",
        "status",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${(0, node_crypto_1.randomUUID)()},
        ${turnState.relationship.stage},
        ${summary},
        ${nextTrust},
        ${nextCloseness},
        ${turnState.rhythm.pacing},
        ${this.toTextArray(turnState.safety.notes)},
        ${this.toTextArray(sourceMessageIds)},
        1,
        ${current.length > 0 ? current[0].version + 1 : 1},
        true,
        'pending',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;
    }
    async writeBoundaryEvent(note, sourceMessageIds, severity) {
        await this.prisma.$executeRaw `
      INSERT INTO "BoundaryEvent" (
        "id",
        "note",
        "severity",
        "sourceMessageIds",
        "createdAt"
      )
      VALUES (
        ${(0, node_crypto_1.randomUUID)()},
        ${note},
        ${severity},
        ${this.toTextArray(sourceMessageIds)},
        CURRENT_TIMESTAMP
      )
    `;
    }
    buildCognitiveProfileNote(turnState) {
        const mode = turnState.userState.needMode === 'decision'
            ? '用户在关键时刻倾向通过对比推进决定'
            : turnState.userState.needMode === 'co_thinking'
                ? '用户更容易在并肩梳理中打开思路'
                : '用户需要先被理解再进入分析';
        return `${mode}；当前偏好${turnState.responseStrategy.primaryMode}式回应`;
    }
    buildRelationshipNote(turnState) {
        return `关系处于${turnState.relationship.stage}阶段；此类时刻适合${turnState.affinity.mode}与${turnState.rhythm.pacing}节奏`;
    }
    buildBoundaryNote(turnState) {
        return `本轮需注意：${turnState.safety.notes.join('、')}`;
    }
    resolveProfileKind(turnState) {
        if (turnState.userState.needMode === 'decision')
            return 'decision_pattern';
        if (turnState.userState.needMode === 'co_thinking')
            return 'thinking_pattern';
        return 'support_preference';
    }
    computeNextTrust(turnState, current) {
        const base = current ?? 0.5;
        const delta = turnState.userState.fragility === 'high' ? 0.03 : 0.01;
        return Math.min(0.95, Number((base + delta).toFixed(2)));
    }
    computeNextCloseness(turnState, current) {
        const base = current ?? 0.5;
        const delta = turnState.relationship.stage === 'steady' ? 0.03 : 0.015;
        return Math.min(0.95, Number((base + delta).toFixed(2)));
    }
    toTextArray(items) {
        if (items.length === 0) {
            return client_1.Prisma.sql `ARRAY[]::TEXT[]`;
        }
        return client_1.Prisma.sql `ARRAY[${client_1.Prisma.join(items)}]::TEXT[]`;
    }
};
exports.CognitiveGrowthService = CognitiveGrowthService;
exports.CognitiveGrowthService = CognitiveGrowthService = CognitiveGrowthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CognitiveGrowthService);
//# sourceMappingURL=cognitive-growth.service.js.map