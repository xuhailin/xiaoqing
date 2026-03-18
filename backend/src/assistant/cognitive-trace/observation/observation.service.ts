import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma.service';
import type {
  CognitiveObservationRecord,
  CreateObservationDto,
  ObservationDayGroup,
  ObservationDimension,
  ObservationQuery,
} from '../cognitive-trace.types';

@Injectable()
export class ObservationService {
  private readonly logger = new Logger(ObservationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createMany(dtos: CreateObservationDto[]): Promise<CognitiveObservationRecord[]> {
    if (dtos.length === 0) return [];

    const records = await Promise.all(
      dtos.map((dto) =>
        this.prisma.cognitiveObservation.create({
          data: {
            dimension: dto.dimension,
            kind: dto.kind,
            title: dto.title,
            detail: dto.detail ?? null,
            source: dto.source,
            conversationId: dto.conversationId ?? null,
            messageId: dto.messageId ?? null,
            significance: dto.significance,
            happenedAt: dto.happenedAt ?? new Date(),
            payload: dto.payload ? (dto.payload as Prisma.InputJsonValue) : Prisma.DbNull,
            relatedTracePointIds: dto.relatedTracePointIds ?? [],
          },
        }),
      ),
    );

    this.logger.debug(`Created ${records.length} cognitive observations`);
    return records.map(this.toRecord);
  }

  async query(q: ObservationQuery): Promise<CognitiveObservationRecord[]> {
    const where: Record<string, unknown> = {};

    if (q.dimension) where.dimension = q.dimension;
    if (q.kind) where.kind = q.kind;
    if (q.conversationId) where.conversationId = q.conversationId;
    if (q.minSignificance) where.significance = { gte: q.minSignificance };

    const dateFilter: Record<string, Date> = {};
    if (q.since) dateFilter.gte = q.since;
    if (q.until) dateFilter.lte = q.until;
    if (Object.keys(dateFilter).length > 0) where.happenedAt = dateFilter;

    const rows = await this.prisma.cognitiveObservation.findMany({
      where,
      orderBy: { happenedAt: 'desc' },
      take: q.limit ?? 50,
    });

    return rows.map(this.toRecord);
  }

  async queryByDay(options?: {
    since?: Date;
    until?: Date;
    minSignificance?: number;
  }): Promise<ObservationDayGroup[]> {
    const where: Record<string, unknown> = {};
    if (options?.minSignificance) where.significance = { gte: options.minSignificance };

    const dateFilter: Record<string, Date> = {};
    if (options?.since) dateFilter.gte = options.since;
    if (options?.until) dateFilter.lte = options.until;
    if (Object.keys(dateFilter).length > 0) where.happenedAt = dateFilter;

    const rows = await this.prisma.cognitiveObservation.findMany({
      where,
      orderBy: { happenedAt: 'asc' },
    });

    const dayMap = new Map<string, CognitiveObservationRecord[]>();
    for (const row of rows) {
      const dayKey = this.toDayKey(row.happenedAt);
      const list = dayMap.get(dayKey) ?? [];
      list.push(this.toRecord(row));
      dayMap.set(dayKey, list);
    }

    return Array.from(dayMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dayKey, observations]) => ({
        dayKey,
        observations,
        count: observations.length,
        dominantDimension: this.dominantDimension(observations),
      }));
  }

  async getForDay(dayKey: string): Promise<CognitiveObservationRecord[]> {
    const start = new Date(`${dayKey}T00:00:00`);
    const end = new Date(`${dayKey}T23:59:59.999`);

    const rows = await this.prisma.cognitiveObservation.findMany({
      where: { happenedAt: { gte: start, lte: end } },
      orderBy: { happenedAt: 'asc' },
    });

    return rows.map(this.toRecord);
  }

  async countByDimension(dayKey: string): Promise<Record<string, number>> {
    const observations = await this.getForDay(dayKey);
    const counts: Record<string, number> = {};
    for (const o of observations) {
      counts[o.dimension] = (counts[o.dimension] ?? 0) + 1;
    }
    return counts;
  }

  private toDayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private dominantDimension(observations: CognitiveObservationRecord[]): ObservationDimension | null {
    const counts = new Map<string, number>();
    for (const o of observations) {
      counts.set(o.dimension, (counts.get(o.dimension) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0] as ObservationDimension;
  }

  private toRecord(row: {
    id: string;
    dimension: string;
    kind: string;
    title: string;
    detail: string | null;
    source: string;
    conversationId: string | null;
    messageId: string | null;
    significance: number;
    happenedAt: Date;
    createdAt: Date;
    payload: unknown;
    insightId: string | null;
    relatedTracePointIds: string[];
  }): CognitiveObservationRecord {
    return {
      id: row.id,
      dimension: row.dimension as ObservationDimension,
      kind: row.kind as CognitiveObservationRecord['kind'],
      title: row.title,
      detail: row.detail,
      source: row.source,
      conversationId: row.conversationId,
      messageId: row.messageId,
      significance: row.significance,
      happenedAt: row.happenedAt,
      createdAt: row.createdAt,
      payload: row.payload as Record<string, unknown> | null,
      insightId: row.insightId,
      relatedTracePointIds: row.relatedTracePointIds,
    };
  }
}
