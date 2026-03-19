import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import type { SocialEntityQuery, SocialEntityRecord, SocialRelation, SyncResult } from './social-entity.types';

@Injectable()
export class SocialEntityService {
  private readonly logger = new Logger(SocialEntityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 从指定的 TracePoint ID 列表中提取 people，增量同步到 SocialEntity。
   * 适合在 TracePoint 提取完成后立即调用。
   */
  async syncFromTracePointIds(tracePointIds: string[]): Promise<SyncResult> {
    if (tracePointIds.length === 0) return { created: 0, updated: 0, total: 0, entityIds: [] };

    const points = await this.prisma.tracePoint.findMany({
      where: { id: { in: tracePointIds } },
      select: { people: true, createdAt: true },
    });

    const peopleMap = this.collectPeopleWithTimestamps(points);
    return this.upsertEntities(peopleMap);
  }

  /**
   * 从某个时间点之后的所有 TracePoint 同步。适合手动回填。
   */
  async syncFromTracePoints(since?: Date): Promise<SyncResult> {
    const points = await this.prisma.tracePoint.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      select: { people: true, createdAt: true },
    });

    const peopleMap = this.collectPeopleWithTimestamps(points);
    return this.upsertEntities(peopleMap);
  }

  async list(query?: SocialEntityQuery): Promise<SocialEntityRecord[]> {
    const where: Record<string, unknown> = {};
    if (query?.relation) where.relation = query.relation;

    const sortBy = query?.sortBy ?? 'mentionCount';
    const orderBy =
      sortBy === 'name'
        ? { name: 'asc' as const }
        : { [sortBy]: 'desc' as const };

    const rows = await this.prisma.socialEntity.findMany({
      where,
      orderBy,
      take: query?.limit ?? 100,
    });

    return rows.map(this.toRecord);
  }

  async findRelevant(context: string, limit = 3): Promise<SocialEntityRecord[]> {
    const rows = await this.prisma.socialEntity.findMany({
      where: {
        description: { not: null },
      },
      orderBy: [{ mentionCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: 80,
    });

    const normalized = context.trim().toLowerCase();
    if (!normalized) {
      return rows.slice(0, limit).map((row) => this.toRecord(row));
    }

    return rows
      .map((row) => ({
        row,
        score: this.computeRelevanceScore(normalized, row.name, row.aliases, row.description ?? ''),
      }))
      .filter((item) => item.score > 0.55)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => this.toRecord(item.row));
  }

  async update(
    id: string,
    patch: Partial<Pick<SocialEntityRecord, 'relation' | 'description' | 'aliases' | 'tags'>>,
  ): Promise<SocialEntityRecord> {
    const row = await this.prisma.socialEntity.update({
      where: { id },
      data: patch,
    });
    return this.toRecord(row);
  }

  async merge(sourceId: string, targetId: string): Promise<SocialEntityRecord> {
    const [source, target] = await Promise.all([
      this.prisma.socialEntity.findUniqueOrThrow({ where: { id: sourceId } }),
      this.prisma.socialEntity.findUniqueOrThrow({ where: { id: targetId } }),
    ]);

    // 合并 aliases：target 保留，source 的 name + aliases 都加入 target.aliases
    const mergedAliases = [
      ...new Set([...target.aliases, source.name, ...source.aliases]),
    ].filter((a) => a !== target.name);

    const merged = await this.prisma.socialEntity.update({
      where: { id: targetId },
      data: {
        aliases: mergedAliases,
        mentionCount: target.mentionCount + source.mentionCount,
        firstSeenAt: source.firstSeenAt < target.firstSeenAt ? source.firstSeenAt : target.firstSeenAt,
        lastSeenAt: source.lastSeenAt > target.lastSeenAt ? source.lastSeenAt : target.lastSeenAt,
        tags: [...new Set([...target.tags, ...source.tags])],
      },
    });

    await this.prisma.socialEntity.delete({ where: { id: sourceId } });
    this.logger.log(`Merged SocialEntity "${source.name}" into "${target.name}"`);

    return this.toRecord(merged);
  }

  // ── Private ──────────────────────────────────────────────

  private collectPeopleWithTimestamps(
    points: Array<{ people: string[]; createdAt: Date }>,
  ): Map<string, { count: number; firstSeen: Date; lastSeen: Date }> {
    const map = new Map<string, { count: number; firstSeen: Date; lastSeen: Date }>();

    for (const point of points) {
      for (const name of point.people) {
        const trimmed = name.trim();
        if (!trimmed) continue;

        const existing = map.get(trimmed);
        if (existing) {
          existing.count++;
          if (point.createdAt < existing.firstSeen) existing.firstSeen = point.createdAt;
          if (point.createdAt > existing.lastSeen) existing.lastSeen = point.createdAt;
        } else {
          map.set(trimmed, {
            count: 1,
            firstSeen: point.createdAt,
            lastSeen: point.createdAt,
          });
        }
      }
    }

    return map;
  }

  private async upsertEntities(
    peopleMap: Map<string, { count: number; firstSeen: Date; lastSeen: Date }>,
  ): Promise<SyncResult> {
    let created = 0;
    let updated = 0;
    const entityIds: string[] = [];

    for (const [name, info] of peopleMap) {
      // 先尝试按 name 或 aliases 匹配已有实体
      const existing = await this.findByNameOrAlias(name);

      if (existing) {
        const row = await this.prisma.socialEntity.update({
          where: { id: existing.id },
          data: {
            mentionCount: { increment: info.count },
            lastSeenAt: info.lastSeen > existing.lastSeenAt ? info.lastSeen : existing.lastSeenAt,
            firstSeenAt: info.firstSeen < existing.firstSeenAt ? info.firstSeen : existing.firstSeenAt,
          },
        });
        entityIds.push(row.id);
        updated++;
      } else {
        const row = await this.prisma.socialEntity.create({
          data: {
            name,
            firstSeenAt: info.firstSeen,
            lastSeenAt: info.lastSeen,
            mentionCount: info.count,
          },
        });
        entityIds.push(row.id);
        created++;
      }
    }

    this.logger.log(`SocialEntity sync: created=${created}, updated=${updated}`);
    return { created, updated, total: created + updated, entityIds: [...new Set(entityIds)] };
  }

  private async findByNameOrAlias(name: string) {
    // 先精确匹配 name
    const byName = await this.prisma.socialEntity.findUnique({ where: { name } });
    if (byName) return byName;

    // 再搜索 aliases 包含此名字
    const byAlias = await this.prisma.socialEntity.findFirst({
      where: { aliases: { has: name } },
    });
    return byAlias;
  }

  private computeRelevanceScore(
    normalizedContext: string,
    name: string,
    aliases: string[],
    description: string,
  ): number {
    let score = 0;
    const candidates = [name, ...aliases]
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (candidates.some((item) => normalizedContext.includes(item))) {
      score += 0.72;
    }

    const keywords = (description.match(/[A-Za-z0-9]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? [])
      .map((token) => token.toLowerCase());
    if (keywords.some((token) => normalizedContext.includes(token))) {
      score += 0.18;
    }

    return score;
  }

  private toRecord(row: {
    id: string;
    name: string;
    aliases: string[];
    relation: string;
    description: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    mentionCount: number;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
  }): SocialEntityRecord {
    return {
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      relation: row.relation as SocialRelation,
      description: row.description,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      mentionCount: row.mentionCount,
      tags: row.tags,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
