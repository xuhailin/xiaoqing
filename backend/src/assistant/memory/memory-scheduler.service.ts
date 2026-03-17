import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';
import { MemoryDecayService } from './memory-decay.service';
import { isFeatureEnabled } from '../../config/feature-flags';

/** 记忆晋升/降级候选 */
export interface PromotionCandidate {
  id: string;
  type: string;
  category: string;
  content: string;
  hitCount: number;
  createdAt: Date;
  direction: 'promote' | 'demote';
  reason: string;
}

@Injectable()
export class MemorySchedulerService {
  private readonly enabled: boolean;
  /** mid → long 晋升：最少命中次数（默认 5） */
  private readonly promoteMinHits: number;
  /** mid → long 晋升：最少存活天数（默认 7） */
  private readonly promoteMinAgeDays: number;
  /** long → mid 降级：未命中天数阈值（默认 30） */
  private readonly demoteInactiveDays: number;
  private readonly logger = new Logger(MemorySchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private decay: MemoryDecayService,
    config: ConfigService,
  ) {
    this.enabled = isFeatureEnabled(config, 'memoryScheduler');
    this.promoteMinHits = Number(config.get('MEMORY_PROMOTE_MIN_HITS')) || 5;
    this.promoteMinAgeDays = Number(config.get('MEMORY_PROMOTE_MIN_AGE_DAYS')) || 7;
    this.demoteInactiveDays = Number(config.get('MEMORY_DEMOTE_INACTIVE_DAYS')) || 30;
  }

  // ── A2: 每日凌晨 3 点重算衰减 + 软删低分记忆 ───────────
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDecayRecalc() {
    if (!this.enabled) return;

    this.logger.log('Daily decay recalculation started');
    const updated = await this.decay.recalcAll();
    this.logger.log(`Decay recalculated: ${updated} memories updated`);

    const candidates = await this.decay.getDecayCandidates();
    if (candidates.length > 0) {
      for (const c of candidates) {
        await this.decay.softDelete(c.id);
      }
      this.logger.log(`Soft-deleted ${candidates.length} decayed memories`);
    }
  }

  // ── A3: 每日凌晨 3:30 检查晋升/降级候选 ────────────────
  @Cron('0 30 3 * * *')
  async handlePromotionCheck() {
    if (!this.enabled) return;

    this.logger.log('Daily promotion/demotion check started');
    const candidates = await this.getPromotionCandidates();
    if (candidates.length > 0) {
      // 自动执行晋升/降级（规则明确，不需要人工确认）
      let promoted = 0;
      let demoted = 0;
      for (const c of candidates) {
        const newType = c.direction === 'promote' ? 'long' : 'mid';
        await this.prisma.memory.update({
          where: { id: c.id },
          data: { type: newType },
        });
        if (c.direction === 'promote') promoted++;
        else demoted++;
      }
      this.logger.log(
        `Promotion/demotion complete: ${promoted} promoted (mid→long), ${demoted} demoted (long→mid)`,
      );
    }
  }

  /**
   * 获取晋升/降级候选列表。
   *
   * 晋升规则（mid → long）：hitCount >= threshold 且存活 >= N 天
   * 降级规则（long → mid）：非 frozen，lastAccessedAt 距今 >= N 天
   */
  async getPromotionCandidates(): Promise<PromotionCandidate[]> {
    const now = new Date();
    const msPerDay = 86_400_000;
    const candidates: PromotionCandidate[] = [];

    // 晋升候选：mid 记忆且命中足够多
    const promoteCandidates = await this.prisma.memory.findMany({
      where: {
        type: 'mid',
        hitCount: { gte: this.promoteMinHits },
        frozen: false,
        decayScore: { gt: 0 }, // 排除已软删的
      },
      select: {
        id: true, type: true, category: true, content: true,
        hitCount: true, createdAt: true, lastAccessedAt: true,
      },
    });

    for (const m of promoteCandidates) {
      const ageDays = (now.getTime() - m.createdAt.getTime()) / msPerDay;
      if (ageDays >= this.promoteMinAgeDays) {
        candidates.push({
          id: m.id,
          type: m.type,
          category: m.category,
          content: m.content,
          hitCount: m.hitCount,
          createdAt: m.createdAt,
          direction: 'promote',
          reason: `hitCount=${m.hitCount} (≥${this.promoteMinHits}), age=${Math.floor(ageDays)}d (≥${this.promoteMinAgeDays}d)`,
        });
      }
    }

    // 降级候选：long 记忆但长期未命中
    const demoteThreshold = new Date(now.getTime() - this.demoteInactiveDays * msPerDay);
    const demoteCandidates = await this.prisma.memory.findMany({
      where: {
        type: 'long',
        frozen: false,
        decayScore: { gt: 0 },
        lastAccessedAt: { lt: demoteThreshold },
      },
      select: {
        id: true, type: true, category: true, content: true,
        hitCount: true, createdAt: true, lastAccessedAt: true,
      },
    });

    for (const m of demoteCandidates) {
      const inactiveDays = Math.floor(
        (now.getTime() - m.lastAccessedAt.getTime()) / msPerDay,
      );
      candidates.push({
        id: m.id,
        type: m.type,
        category: m.category,
        content: m.content,
        hitCount: m.hitCount,
        createdAt: m.createdAt,
        direction: 'demote',
        reason: `inactive ${inactiveDays}d (≥${this.demoteInactiveDays}d)`,
      });
    }

    return candidates;
  }
}
