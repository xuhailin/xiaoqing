import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import type {
  TracePointExtractedBy,
  TracePointDayGroup,
  TracePointDraft,
  TracePointQuery,
  TracePointRecord,
} from './trace-point.types';

export interface DeduplicateResult {
  dayKey: string;
  total: number;
  duplicatesMarked: number;
  groups: Array<{ kind: string; kept: string; markedIds: string[] }>;
}

@Injectable()
export class TracePointService {
  private readonly logger = new Logger(TracePointService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 统计 trace points 数量（用于列表页/统计条） */
  async count(q: TracePointQuery): Promise<number> {
    const where: Record<string, unknown> = {};

    if (q.userId) {
      where.conversationId = {
        in: await this.resolveConversationIds(q.userId, q.conversationId),
      };
    } else if (q.conversationId) {
      where.conversationId = q.conversationId;
    }
    if (q.kind) where.kind = q.kind;

    const dateFilter: Record<string, Date> = {};
    if (q.since) dateFilter.gte = q.since;
    if (q.until) dateFilter.lte = q.until;
    if (Object.keys(dateFilter).length > 0) (where as any).createdAt = dateFilter;

    return this.prisma.tracePoint.count({ where: where as any });
  }

  async save(
    conversationId: string,
    sourceMessageId: string,
    drafts: TracePointDraft[],
    extractedBy: TracePointExtractedBy = 'batch',
  ): Promise<TracePointRecord[]> {
    if (drafts.length === 0) return [];

    const records = await Promise.all(
      drafts.map((draft) =>
        this.prisma.tracePoint.create({
          data: {
            conversationId,
            sourceMessageId,
            kind: draft.kind,
            content: draft.content,
            happenedAt: draft.happenedAt ?? null,
            mood: draft.mood ?? null,
            people: draft.people ?? [],
            tags: draft.tags ?? [],
            extractedBy,
            confidence: 1.0,
          },
        }),
      ),
    );

    return records.map(this.toRecord);
  }

  async query(q: TracePointQuery): Promise<TracePointRecord[]> {
    const where: Record<string, unknown> = {};

    if (q.userId) {
      where.conversationId = {
        in: await this.resolveConversationIds(q.userId, q.conversationId),
      };
    } else if (q.conversationId) {
      where.conversationId = q.conversationId;
    }
    if (q.kind) where.kind = q.kind;

    const dateFilter: Record<string, Date> = {};
    if (q.since) dateFilter.gte = q.since;
    if (q.until) dateFilter.lte = q.until;
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;

    const rows = await this.prisma.tracePoint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 50,
    });

    return rows.map(this.toRecord);
  }

  async hasPointsForMessage(sourceMessageId: string): Promise<boolean> {
    const count = await this.prisma.tracePoint.count({
      where: { sourceMessageId },
    });
    return count > 0;
  }

  async countByConversation(conversationId: string, userId?: string): Promise<number> {
    if (!userId) {
      return this.prisma.tracePoint.count({ where: { conversationId } });
    }

    const conversationIds = await this.resolveConversationIds(userId, conversationId);
    if (conversationIds.length === 0) return 0;
    return this.prisma.tracePoint.count({
      where: { conversationId: { in: conversationIds } },
    });
  }

  /**
   * 按天分组返回 TracePoints。
   */
  async queryByDay(options?: {
    userId?: string;
    since?: Date;
    until?: Date;
    conversationId?: string;
  }): Promise<TracePointDayGroup[]> {
    const where: Record<string, unknown> = {};
    if (options?.userId) {
      where.conversationId = {
        in: await this.resolveConversationIds(options.userId, options.conversationId),
      };
    } else if (options?.conversationId) {
      where.conversationId = options.conversationId;
    }

    const dateFilter: Record<string, Date> = {};
    if (options?.since) dateFilter.gte = options.since;
    if (options?.until) dateFilter.lte = options.until;
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;

    const rows = await this.prisma.tracePoint.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const dayMap = new Map<string, TracePointRecord[]>();
    for (const row of rows) {
      const effectiveDate = row.happenedAt ?? row.createdAt;
      const dayKey = this.toDayKey(effectiveDate);
      const list = dayMap.get(dayKey) ?? [];
      list.push(this.toRecord(row));
      dayMap.set(dayKey, list);
    }

    return Array.from(dayMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dayKey, points]) => ({
        dayKey,
        points,
        moodSummary: this.dominantMood(points),
        count: points.length,
      }));
  }

  /**
   * 获取某一天的所有 TracePoints。
   */
  async getPointsForDay(userId: string, dayKey: string): Promise<TracePointRecord[]> {
    const start = new Date(`${dayKey}T00:00:00`);
    const end = new Date(`${dayKey}T23:59:59.999`);
    const conversationIds = await this.resolveConversationIds(userId);

    if (conversationIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.tracePoint.findMany({
      where: {
        conversationId: { in: conversationIds },
        OR: [
          { happenedAt: { gte: start, lte: end } },
          { happenedAt: null, createdAt: { gte: start, lte: end } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(this.toRecord);
  }

  /**
   * 对某天的碎片做去重：同 kind + 文本相似度 > 0.8 → 标记重复项 confidence=0。
   * 保留 content 最长的一条。
   */
  async deduplicateDay(userId: string, dayKey: string): Promise<DeduplicateResult> {
    const points = await this.getPointsForDay(userId, dayKey);
    const result: DeduplicateResult = {
      dayKey,
      total: points.length,
      duplicatesMarked: 0,
      groups: [],
    };

    if (points.length < 2) return result;

    // 按 kind 分组
    const byKind = new Map<string, TracePointRecord[]>();
    for (const p of points) {
      const list = byKind.get(p.kind) ?? [];
      list.push(p);
      byKind.set(p.kind, list);
    }

    for (const [kind, kindPoints] of byKind) {
      if (kindPoints.length < 2) continue;

      // 聚类：贪心合并相似度 > 0.8 的碎片
      const clusters = this.clusterBySimilarity(kindPoints, 0.8);

      for (const cluster of clusters) {
        if (cluster.length < 2) continue;

        // 保留 content 最长的一条
        const sorted = [...cluster].sort((a, b) => b.content.length - a.content.length);
        const kept = sorted[0];
        const duplicates = sorted.slice(1);
        const dupIds = duplicates.map((d) => d.id);

        // 标记 confidence=0
        await this.prisma.tracePoint.updateMany({
          where: { id: { in: dupIds } },
          data: { confidence: 0 },
        });

        result.duplicatesMarked += dupIds.length;
        result.groups.push({ kind, kept: kept.id, markedIds: dupIds });
      }
    }

    if (result.duplicatesMarked > 0) {
      this.logger.log(
        `Dedup ${dayKey}: ${result.duplicatesMarked} duplicates marked from ${result.total} points`,
      );
    }

    return result;
  }

  /**
   * 批量去重最近 N 天。
   */
  async deduplicateRecent(
    userId: string,
    days: number = 7,
  ): Promise<{ results: DeduplicateResult[]; totalMarked: number }> {
    const results: DeduplicateResult[] = [];
    let totalMarked = 0;

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = this.toDayKey(d);
      const result = await this.deduplicateDay(userId, dayKey);
      if (result.duplicatesMarked > 0) {
        results.push(result);
        totalMarked += result.duplicatesMarked;
      }
    }

    return { results, totalMarked };
  }

  private async resolveConversationIds(
    userId: string,
    conversationId?: string,
  ): Promise<string[]> {
    const rows = await this.prisma.conversation.findMany({
      where: {
        userId,
        ...(conversationId ? { id: conversationId } : {}),
      },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  /**
   * 贪心聚类：遍历碎片，如果与已有 cluster 的代表项相似度 > threshold，则加入该 cluster。
   */
  private clusterBySimilarity(
    points: TracePointRecord[],
    threshold: number,
  ): TracePointRecord[][] {
    const clusters: TracePointRecord[][] = [];

    for (const point of points) {
      let merged = false;
      for (const cluster of clusters) {
        // 和 cluster 中最长（代表）的一条比较
        if (this.textSimilarity(cluster[0].content, point.content) >= threshold) {
          cluster.push(point);
          merged = true;
          break;
        }
      }
      if (!merged) {
        clusters.push([point]);
      }
    }

    return clusters;
  }

  /**
   * bigram 相似度（Dice coefficient）。
   */
  private textSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const bigramsA = new Set<string>();
    for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

    const bigramsB = new Set<string>();
    for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

    let intersection = 0;
    for (const bg of bigramsA) {
      if (bigramsB.has(bg)) intersection++;
    }

    return (2 * intersection) / (bigramsA.size + bigramsB.size);
  }

  private toDayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private dominantMood(points: TracePointRecord[]): string | null {
    const counts = new Map<string, number>();
    for (const p of points) {
      if (p.mood) counts.set(p.mood, (counts.get(p.mood) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }

  private toRecord(row: {
    id: string;
    conversationId: string;
    sourceMessageId: string;
    kind: string;
    content: string;
    happenedAt: Date | null;
    mood: string | null;
    people: string[];
    tags: string[];
    extractedBy: string;
    confidence: number;
    createdAt: Date;
  }): TracePointRecord {
    return {
      id: row.id,
      conversationId: row.conversationId,
      sourceMessageId: row.sourceMessageId,
      kind: row.kind as TracePointRecord['kind'],
      content: row.content,
      happenedAt: row.happenedAt,
      mood: row.mood,
      people: row.people,
      tags: row.tags,
      extractedBy: row.extractedBy as TracePointRecord['extractedBy'],
      confidence: row.confidence,
      createdAt: row.createdAt,
    };
  }
}
