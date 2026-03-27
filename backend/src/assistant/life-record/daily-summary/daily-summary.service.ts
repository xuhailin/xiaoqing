import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import { TracePointService } from '../trace-point/trace-point.service';
import { DailySummaryGenerator } from './daily-summary-generator';
import type { DailySummaryRecord, DailySummaryWithPoints } from './daily-summary.types';

@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger(DailySummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracePointService: TracePointService,
    private readonly generator: DailySummaryGenerator,
  ) {}

  /**
   * 为指定日期生成日摘要。如果已存在则覆盖（regenerate）。
   */
  async generateForDay(userId: string, dayKey: string): Promise<DailySummaryRecord> {
    const points = await this.tracePointService.getPointsForDay(userId, dayKey);

    if (points.length === 0) {
      this.logger.log(`No trace points for ${dayKey}, skipping summary generation`);
      throw new Error(`No trace points found for ${dayKey}`);
    }

    const draft = await this.generator.generate(dayKey, points);

    const existing = await this.prisma.dailySummary.findUnique({
      where: { userId_dayKey: { userId, dayKey } },
    });

    const data = {
      userId,
      dayKey,
      title: draft.title,
      body: draft.body,
      moodOverall: draft.moodOverall,
      pointCount: points.length,
      sourcePointIds: points.map((p) => p.id),
      generatedBy: 'llm' as const,
    };

    const row = existing
      ? await this.prisma.dailySummary.update({ where: { userId_dayKey: { userId, dayKey } }, data })
      : await this.prisma.dailySummary.create({ data });

    this.logger.log(
      `${existing ? 'Regenerated' : 'Generated'} summary for ${dayKey}: "${draft.title}" (${points.length} points)`,
    );

    return this.toRecord(row);
  }

  /**
   * 获取指定日期的日摘要（含关联的 TracePoints）。
   */
  async getForDay(userId: string, dayKey: string): Promise<DailySummaryWithPoints | null> {
    const row = await this.prisma.dailySummary.findUnique({
      where: { userId_dayKey: { userId, dayKey } },
    });

    if (!row) return null;

    const points = await this.tracePointService.getPointsForDay(userId, dayKey);
    return { ...this.toRecord(row), points };
  }

  /**
   * 列出日摘要列表。
   */
  async list(userId: string, options?: { limit?: number; since?: string; until?: string }): Promise<DailySummaryRecord[]> {
    const where: Record<string, unknown> = { userId };
    if (options?.since || options?.until) {
      const dayFilter: Record<string, string> = {};
      if (options.since) dayFilter.gte = options.since;
      if (options.until) dayFilter.lte = options.until;
      where.dayKey = dayFilter;
    }

    const rows = await this.prisma.dailySummary.findMany({
      where,
      orderBy: { dayKey: 'desc' },
      take: options?.limit ?? 30,
    });

    return rows.map(this.toRecord);
  }

  /**
   * 批量为最近 N 天生成日摘要。
   */
  async generateRecent(userId: string, days: number = 7): Promise<{ generated: number; skipped: number }> {
    let generated = 0;
    let skipped = 0;

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = this.toDayKey(d);

      try {
        await this.generateForDay(userId, dayKey);
        generated++;
      } catch {
        skipped++;
      }
    }

    return { generated, skipped };
  }

  private toDayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private toRecord(row: {
    id: string;
    dayKey: string;
    title: string;
    body: string;
    moodOverall: string | null;
    pointCount: number;
    sourcePointIds: string[];
    generatedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): DailySummaryRecord {
    return {
      id: row.id,
      dayKey: row.dayKey,
      title: row.title,
      body: row.body,
      moodOverall: row.moodOverall,
      pointCount: row.pointCount,
      sourcePointIds: row.sourcePointIds,
      generatedBy: row.generatedBy as DailySummaryRecord['generatedBy'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
