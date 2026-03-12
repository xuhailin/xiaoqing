import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma.service';
import { MemoryCategory } from '../memory/memory-category';
import type { CognitiveTurnState, PersistedGrowthContext } from './cognitive-pipeline.types';

export type GrowthItemType = 'cognitive_profile' | 'relationship_state';
export type GrowthStatus = 'pending' | 'confirmed' | 'rejected';

export interface PendingGrowthItem {
  id: string;
  type: GrowthItemType;
  content: string;
  kind?: string; // only for cognitive_profile
  stage?: string; // only for relationship_state
  status: GrowthStatus;
  sourceMessageIds: string[];
  createdAt: Date;
}

@Injectable()
export class CognitiveGrowthService {
  constructor(private prisma: PrismaService) {}

  // ── Growth Context (only confirmed records) ────────────

  async getGrowthContext(): Promise<PersistedGrowthContext> {
    const [profiles, judgmentPatterns, valuePriorities, rhythmPatterns, relationships, boundaries] = await Promise.all([
      this.prisma.$queryRaw<Array<{ content: string }>>`
        SELECT "content"
        FROM "CognitiveProfile"
        WHERE "isActive" = true AND "status" = 'confirmed'
        ORDER BY "updatedAt" DESC
        LIMIT 6
      `,
      this.prisma.memory.findMany({
        where: {
          type: 'long',
          category: MemoryCategory.JUDGMENT_PATTERN,
          decayScore: { gt: 0 },
        },
        select: { content: true },
        orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
        take: 4,
      }),
      this.prisma.memory.findMany({
        where: {
          type: 'long',
          category: MemoryCategory.VALUE_PRIORITY,
          decayScore: { gt: 0 },
        },
        select: { content: true },
        orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
        take: 4,
      }),
      this.prisma.memory.findMany({
        where: {
          type: 'long',
          category: MemoryCategory.RHYTHM_PATTERN,
          decayScore: { gt: 0 },
        },
        select: { content: true },
        orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
        take: 4,
      }),
      this.prisma.$queryRaw<Array<{ summary: string }>>`
        SELECT "summary"
        FROM "RelationshipState"
        WHERE "isActive" = true AND "status" = 'confirmed'
        ORDER BY "updatedAt" DESC
        LIMIT 2
      `,
      this.prisma.$queryRaw<Array<{ note: string }>>`
        SELECT "note"
        FROM "BoundaryEvent"
        ORDER BY "createdAt" DESC
        LIMIT 5
      `,
    ]);

    const unique = (items: string[], limit: number): string[] => {
      const result: string[] = [];
      const seen = new Set<string>();
      for (const raw of items) {
        const item = raw?.trim();
        if (!item) continue;
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
        if (result.length >= limit) break;
      }
      return result;
    };

    const context: PersistedGrowthContext = {
      cognitiveProfiles: unique(profiles.map((row) => row.content), 6),
      judgmentPatterns: unique(judgmentPatterns.map((row) => row.content), 4),
      valuePriorities: unique(valuePriorities.map((row) => row.content), 4),
      rhythmPatterns: unique(rhythmPatterns.map((row) => row.content), 4),
      relationshipNotes: unique(relationships.map((row) => row.summary), 2),
      boundaryNotes: unique(boundaries.map((row) => row.note), 5),
    };

    // 检查是否满足阶段晋升条件
    await this.checkStagePromotion();

    return context;
  }

  // ── Record Turn Growth (writes as pending) ─────────────

  async recordTurnGrowth(
    turnState: CognitiveTurnState,
    sourceMessageIds: string[],
  ): Promise<void> {
    if (sourceMessageIds.length === 0) return;

    if (turnState.userModelDelta.shouldWriteCognitive) {
      const content = this.buildCognitiveProfileNote(turnState);
      await this.writeOrBumpProfile(
        this.resolveProfileKind(turnState),
        content,
        sourceMessageIds,
        0.72,
      );
    }

    if (turnState.userModelDelta.shouldWriteRelationship) {
      await this.writeRelationshipState(
        turnState,
        sourceMessageIds,
      );
    }

    // BoundaryEvent: safety records, always write immediately (no confirmation needed)
    if (turnState.safety.notes.length > 0) {
      const content = this.buildBoundaryNote(turnState);
      await this.writeBoundaryEvent(
        content,
        sourceMessageIds,
        turnState.safety.relationalBoundaryRisk ? 'warn' : 'info',
      );
    }
  }

  // ── Pending / Confirm / Reject ─────────────────────────

  async getPending(): Promise<PendingGrowthItem[]> {
    const [profiles, relationships] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        id: string;
        kind: string;
        content: string;
        status: string;
        sourceMessageIds: string[];
        createdAt: Date;
      }>>`
        SELECT "id", "kind", "content", "status", "sourceMessageIds", "createdAt"
        FROM "CognitiveProfile"
        WHERE "status" = 'pending' AND "isActive" = true
        ORDER BY "createdAt" DESC
        LIMIT 20
      `,
      this.prisma.$queryRaw<Array<{
        id: string;
        stage: string;
        summary: string;
        status: string;
        sourceMessageIds: string[];
        createdAt: Date;
      }>>`
        SELECT "id", "stage", "summary", "status", "sourceMessageIds", "createdAt"
        FROM "RelationshipState"
        WHERE "status" = 'pending' AND "isActive" = true
        ORDER BY "createdAt" DESC
        LIMIT 10
      `,
    ]);

    const items: PendingGrowthItem[] = [
      ...profiles.map((p) => ({
        id: p.id,
        type: 'cognitive_profile' as const,
        content: p.content,
        kind: p.kind,
        status: p.status as GrowthStatus,
        sourceMessageIds: p.sourceMessageIds,
        createdAt: p.createdAt,
      })),
      ...relationships.map((r) => ({
        id: r.id,
        type: 'relationship_state' as const,
        content: r.summary,
        stage: r.stage,
        status: r.status as GrowthStatus,
        sourceMessageIds: r.sourceMessageIds,
        createdAt: r.createdAt,
      })),
    ];

    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async confirmGrowth(id: string, type: GrowthItemType): Promise<void> {
    if (type === 'cognitive_profile') {
      await this.prisma.$executeRaw`
        UPDATE "CognitiveProfile"
        SET "status" = 'confirmed', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "status" = 'pending'
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE "RelationshipState"
        SET "status" = 'confirmed', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "status" = 'pending'
      `;
    }
  }

  async rejectGrowth(id: string, type: GrowthItemType): Promise<void> {
    if (type === 'cognitive_profile') {
      await this.prisma.$executeRaw`
        UPDATE "CognitiveProfile"
        SET "status" = 'rejected', "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "status" = 'pending'
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE "RelationshipState"
        SET "status" = 'rejected', "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "status" = 'pending'
      `;
    }
  }

  async cleanupGrowthForDeletedMessages(messageIds: string[]): Promise<{
    archivedProfiles: number;
    weakenedProfiles: number;
    archivedRelationships: number;
    weakenedRelationships: number;
    deletedBoundaryEvents: number;
    weakenedBoundaryEvents: number;
  }> {
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
      if (hasRemainingSources) weakenedProfiles++;
      else archivedProfiles++;
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
      if (hasRemainingSources) weakenedRelationships++;
      else archivedRelationships++;
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

  // ── Private: Stage Promotion ──────────────────────────

  private static readonly PROMOTION_THRESHOLDS = {
    early_to_familiar: { trustScore: 0.6, closenessScore: 0.5, hitCount: 10 },
    familiar_to_steady: { trustScore: 0.75, closenessScore: 0.7, hitCount: 20 },
  } as const;

  private async checkStagePromotion(): Promise<void> {
    const current = await this.prisma.$queryRaw<Array<{
      id: string;
      stage: string;
      trustScore: number;
      closenessScore: number;
      hitCount: number;
    }>>`
      SELECT "id", "stage", "trustScore", "closenessScore", "hitCount"
      FROM "RelationshipState"
      WHERE "isActive" = true AND "status" = 'confirmed'
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;

    if (current.length === 0) return;

    const { stage, trustScore, closenessScore, hitCount } = current[0];
    let nextStage: string | null = null;
    let threshold: (typeof CognitiveGrowthService.PROMOTION_THRESHOLDS)[keyof typeof CognitiveGrowthService.PROMOTION_THRESHOLDS] | null = null;

    if (stage === 'early') {
      threshold = CognitiveGrowthService.PROMOTION_THRESHOLDS.early_to_familiar;
      if (
        trustScore >= threshold.trustScore &&
        closenessScore >= threshold.closenessScore &&
        hitCount >= threshold.hitCount
      ) {
        nextStage = 'familiar';
      }
    } else if (stage === 'familiar') {
      threshold = CognitiveGrowthService.PROMOTION_THRESHOLDS.familiar_to_steady;
      if (
        trustScore >= threshold.trustScore &&
        closenessScore >= threshold.closenessScore &&
        hitCount >= threshold.hitCount
      ) {
        nextStage = 'steady';
      }
    }

    if (!nextStage) return;

    // 检查是否已有同 stage 的 pending 记录
    const existingPending = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "RelationshipState"
      WHERE "isActive" = true AND "status" = 'pending' AND "stage" = ${nextStage}
      LIMIT 1
    `;

    if (existingPending.length > 0) return;

    const summary = `信任(${trustScore.toFixed(2)})与亲密度(${closenessScore.toFixed(2)})积累充分，建议从 ${stage} 晋升至 ${nextStage}`;

    await this.prisma.$executeRaw`
      INSERT INTO "RelationshipState" (
        "id", "stage", "summary", "trustScore", "closenessScore",
        "boundaryNotes", "sourceMessageIds",
        "hitCount", "version", "isActive", "status",
        "createdAt", "updatedAt"
      )
      VALUES (
        ${randomUUID()}, ${nextStage}, ${summary},
        ${trustScore}, ${closenessScore},
        ARRAY[]::TEXT[], ARRAY[]::TEXT[],
        0, 1, true, 'pending',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;
  }

  // ── Private: Write Methods ─────────────────────────────

  private async writeOrBumpProfile(
    kind: string,
    content: string,
    sourceMessageIds: string[],
    confidence: number,
  ): Promise<void> {
    // Only bump confirmed duplicates; pending duplicates are left as-is
    const existing = await this.prisma.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id", "status"
      FROM "CognitiveProfile"
      WHERE "isActive" = true
        AND "kind" = ${kind}
        AND "content" = ${content}
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;

    if (existing.length > 0) {
      await this.prisma.$executeRaw`
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

    await this.prisma.$executeRaw`
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
        ${randomUUID()},
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

  private async writeRelationshipState(
    turnState: CognitiveTurnState,
    sourceMessageIds: string[],
  ): Promise<void> {
    const summary = this.buildRelationshipNote(turnState);
    const current = await this.prisma.$queryRaw<Array<{
      id: string;
      version: number;
      stage: string;
      summary: string;
      trustScore: number;
      closenessScore: number;
      status: string;
    }>>`
      SELECT "id", "version", "stage", "summary", "trustScore", "closenessScore", "status"
      FROM "RelationshipState"
      WHERE "isActive" = true
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;

    const nextTrust = this.computeNextTrust(turnState, current[0]?.trustScore);
    const nextCloseness = this.computeNextCloseness(turnState, current[0]?.closenessScore);

    if (
      current.length > 0 &&
      current[0].stage === turnState.relationship.stage &&
      current[0].summary === summary
    ) {
      // Same stage & summary → just bump scores (keep existing status)
      await this.prisma.$executeRaw`
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

    // Stage or summary changed → archive old, create new as pending
    if (current.length > 0) {
      await this.prisma.$executeRaw`
        UPDATE "RelationshipState"
        SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${current[0].id}
      `;
    }

    await this.prisma.$executeRaw`
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
        ${randomUUID()},
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

  private async writeBoundaryEvent(
    note: string,
    sourceMessageIds: string[],
    severity: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "BoundaryEvent" (
        "id",
        "note",
        "severity",
        "sourceMessageIds",
        "createdAt"
      )
      VALUES (
        ${randomUUID()},
        ${note},
        ${severity},
        ${this.toTextArray(sourceMessageIds)},
        CURRENT_TIMESTAMP
      )
    `;
  }

  // ── Private: Note Builders ─────────────────────────────

  private buildCognitiveProfileNote(turnState: CognitiveTurnState): string {
    const mode =
      turnState.userState.needMode === 'decision'
        ? '用户在关键时刻倾向通过对比推进决定'
        : turnState.userState.needMode === 'co_thinking'
          ? '用户更容易在并肩梳理中打开思路'
          : '用户需要先被理解再进入分析';
    return `${mode}；当前偏好${turnState.responseStrategy.primaryMode}式回应`;
  }

  private buildRelationshipNote(turnState: CognitiveTurnState): string {
    return `关系处于${turnState.relationship.stage}阶段；此类时刻适合${turnState.affinity.mode}与${turnState.rhythm.pacing}节奏`;
  }

  private buildBoundaryNote(turnState: CognitiveTurnState): string {
    return `本轮需注意：${turnState.safety.notes.join('、')}`;
  }

  private resolveProfileKind(turnState: CognitiveTurnState): string {
    if (turnState.userState.needMode === 'decision') return 'decision_pattern';
    if (turnState.userState.needMode === 'co_thinking') return 'thinking_pattern';
    return 'support_preference';
  }

  private computeNextTrust(
    turnState: CognitiveTurnState,
    current?: number,
  ): number {
    const base = current ?? 0.5;
    const delta = turnState.userState.fragility === 'high' ? 0.03 : 0.01;
    return Math.min(0.95, Number((base + delta).toFixed(2)));
  }

  private computeNextCloseness(
    turnState: CognitiveTurnState,
    current?: number,
  ): number {
    const base = current ?? 0.5;
    const delta = turnState.relationship.stage === 'steady' ? 0.03 : 0.015;
    return Math.min(0.95, Number((base + delta).toFixed(2)));
  }

  private toTextArray(items: string[]): Prisma.Sql {
    if (items.length === 0) {
      return Prisma.sql`ARRAY[]::TEXT[]`;
    }
    return Prisma.sql`ARRAY[${Prisma.join(items)}]::TEXT[]`;
  }
}
