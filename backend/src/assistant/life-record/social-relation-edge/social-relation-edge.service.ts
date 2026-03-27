import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import type {
  RelevantSocialRelationEdgeRecord,
  SocialRelationTrend,
  SocialRelationEdgeQuery,
  SocialRelationEdgeRecord,
  SocialRelationEdgeSyncResult,
} from './social-relation-edge.types';

const USER_ENTITY_ID = 'default-user';

@Injectable()
export class SocialRelationEdgeService {
  private readonly logger = new Logger(SocialRelationEdgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query?: SocialRelationEdgeQuery): Promise<SocialRelationEdgeRecord[]> {
    const where: Record<string, unknown> = { userId };
    if (query?.toEntityId) where.toEntityId = query.toEntityId;
    if (query?.trend) where.trend = query.trend;

    const rows = await this.prisma.socialRelationEdge.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: query?.limit ?? 50,
    });

    return rows.map((row) => this.toRecord(row));
  }

  async findRelevant(
    userId: string,
    context: string,
    limit = 2,
    preferredEntityIds: string[] = [],
  ): Promise<RelevantSocialRelationEdgeRecord[]> {
    const rows = await this.prisma.socialRelationEdge.findMany({
      where: { userId },
      include: {
        toEntity: {
          select: {
            name: true,
            aliases: true,
            relation: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { quality: 'asc' }],
      take: 40,
    });

    const normalized = context.trim().toLowerCase();

    return rows
      .map((row) => ({
        row,
        score: this.computeRelevanceScore(row, normalized, preferredEntityIds),
      }))
      .filter((item) => item.score > 0.55)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => this.toRelevantRecord(item.row));
  }

  async syncFromTracePoints(userId: string, since?: Date): Promise<SocialRelationEdgeSyncResult> {
    const conversationIds = await this.getConversationIds(userId);
    if (conversationIds.length === 0) {
      return { created: 0, updated: 0, total: 0 };
    }

    const [points, entities] = await Promise.all([
      this.prisma.tracePoint.findMany({
        where: {
          kind: 'relation_event',
          confidence: { gt: 0 },
          conversationId: { in: conversationIds },
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        select: {
          content: true,
          people: true,
          createdAt: true,
        },
      }),
      this.loadEntities(userId),
    ]);

    return this.syncFromPoints(points, entities, userId, conversationIds);
  }

  async syncFromTracePointIds(tracePointIds: string[], userId: string): Promise<SocialRelationEdgeSyncResult> {
    if (tracePointIds.length === 0) {
      return { created: 0, updated: 0, total: 0 };
    }

    const conversationIds = await this.getConversationIds(userId);
    if (conversationIds.length === 0) {
      return { created: 0, updated: 0, total: 0 };
    }

    const [points, entities] = await Promise.all([
      this.prisma.tracePoint.findMany({
        where: {
          id: { in: tracePointIds },
          kind: 'relation_event',
          confidence: { gt: 0 },
          conversationId: { in: conversationIds },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          content: true,
          people: true,
          createdAt: true,
        },
      }),
      this.loadEntities(userId),
    ]);

    return this.syncFromPoints(points, entities, userId, conversationIds);
  }

  private async loadEntities(userId: string) {
    return this.prisma.socialEntity.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        aliases: true,
        relation: true,
      },
    });
  }

  private async syncFromPoints(
    points: Array<{
      content: string;
      people: string[];
      createdAt: Date;
    }>,
    entities: Array<{
      id: string;
      name: string;
      aliases: string[];
      relation: string;
    }>,
    userId: string,
    conversationIds: string[],
  ): Promise<SocialRelationEdgeSyncResult> {
    if (points.length === 0 || entities.length === 0) {
      return { created: 0, updated: 0, total: 0 };
    }

    const nameToEntity = new Map<string, { id: string; relation: string; name: string }>();
    for (const entity of entities) {
      nameToEntity.set(entity.name, entity);
      for (const alias of entity.aliases) {
        nameToEntity.set(alias, entity);
      }
    }

    let created = 0;
    let updated = 0;

    for (const point of points) {
      const delta = this.computeDelta(point.content);
      if (delta === 0) continue;

      const relatedEntities = [...new Set(
        point.people
          .map((name) => nameToEntity.get(name))
          .filter((entity): entity is { id: string; relation: string; name: string } => Boolean(entity)),
      )];

      for (const entity of relatedEntities) {
        const existing = await this.prisma.socialRelationEdge.findUnique({
          where: {
            userId_fromEntityId_toEntityId: {
              userId,
              fromEntityId: USER_ENTITY_ID,
              toEntityId: entity.id,
            },
          },
        });

        const trend = await this.computeTrend(entity, point.createdAt, conversationIds);
        const nextQuality = this.clampQuality((existing?.quality ?? 0.5) + delta);
        const row = await this.prisma.socialRelationEdge.upsert({
          where: {
            userId_fromEntityId_toEntityId: {
              userId,
              fromEntityId: USER_ENTITY_ID,
              toEntityId: entity.id,
            },
          },
          update: {
            relationType: entity.relation,
            quality: nextQuality,
            trend,
            lastEventAt: point.createdAt,
            notes: point.content,
          },
          create: {
            userId,
            fromEntityId: USER_ENTITY_ID,
            toEntityId: entity.id,
            relationType: entity.relation,
            quality: nextQuality,
            trend,
            lastEventAt: point.createdAt,
            notes: point.content,
          },
        });

        if (existing) {
          updated++;
        } else if (row) {
          created++;
        }
      }
    }

    this.logger.log(`SocialRelationEdge sync: created=${created}, updated=${updated}`);
    return { created, updated, total: created + updated };
  }

  private async computeTrend(
    entity: { name: string; aliases?: string[] },
    until: Date,
    conversationIds: string[],
  ): Promise<SocialRelationTrend> {
    const rows = await this.prisma.tracePoint.findMany({
      where: {
        kind: 'relation_event',
        createdAt: { lte: until },
        conversationId: { in: conversationIds },
        OR: [
          { people: { has: entity.name } },
          ...(entity.aliases ?? []).map((alias) => ({ people: { has: alias } })),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { content: true },
    });

    const deltas = rows.map((row) => this.computeDelta(row.content)).filter((delta) => delta !== 0);
    if (deltas.length === 0) return 'stable';

    const avg = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
    if (avg >= 0.04) return 'improving';
    if (avg <= -0.04) return 'declining';
    return 'stable';
  }

  private computeDelta(content: string): number {
    const text = content.toLowerCase();
    const positivePatterns = [/和好/, /缓和/, /靠近/, /亲近/, /支持/, /陪/, /一起/, /庆祝/, /聊开/];
    const negativePatterns = [/吵架/, /冲突/, /冷战/, /疏远/, /闹僵/, /失望/, /不理/, /矛盾/];

    if (negativePatterns.some((pattern) => pattern.test(text))) return -0.1;
    if (positivePatterns.some((pattern) => pattern.test(text))) return 0.08;
    return 0;
  }

  private clampQuality(value: number): number {
    return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
  }

  private async getConversationIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private computeRelevanceScore(
    row: {
      toEntityId: string;
      quality: number;
      trend: string;
      notes: string | null;
      toEntity: {
        name: string;
        aliases: string[];
      };
    },
    normalizedContext: string,
    preferredEntityIds: string[],
  ): number {
    let score = 0;

    if (preferredEntityIds.includes(row.toEntityId)) {
      score += 0.56;
    }

    if (normalizedContext) {
      const names = [row.toEntity.name, ...row.toEntity.aliases]
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      if (names.some((name) => normalizedContext.includes(name))) {
        score += 0.66;
      }

      if (row.notes) {
        const note = row.notes.trim().toLowerCase();
        if (note && (normalizedContext.includes(note) || note.includes(normalizedContext))) {
          score += 0.18;
        }
      }
    }

    if (row.trend === 'declining') score += 0.14;
    if (row.quality <= 0.45) score += 0.08;
    return score;
  }

  private toRecord(row: {
    id: string;
    fromEntityId: string;
    toEntityId: string;
    relationType: string;
    quality: number;
    trend: string;
    lastEventAt: Date;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SocialRelationEdgeRecord {
    return {
      id: row.id,
      fromEntityId: row.fromEntityId,
      toEntityId: row.toEntityId,
      relationType: row.relationType,
      quality: row.quality,
      trend: row.trend as SocialRelationTrend,
      lastEventAt: row.lastEventAt,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toRelevantRecord(row: {
    id: string;
    fromEntityId: string;
    toEntityId: string;
    relationType: string;
    quality: number;
    trend: string;
    lastEventAt: Date;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    toEntity: {
      name: string;
      aliases: string[];
      relation: string;
    };
  }): RelevantSocialRelationEdgeRecord {
    return {
      ...this.toRecord(row),
      entityName: row.toEntity.name,
      entityAliases: row.toEntity.aliases,
      entityRelation: row.toEntity.relation,
    };
  }
}
