import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import {
  DECAY_CONFIG,
  MemoryCategory,
  type DecayConfig,
} from './memory-category';

@Injectable()
export class MemoryDecayService {
  constructor(private prisma: PrismaService) {}

  /**
   * 计算单条记忆的衰减分。
   * 公式: clamp( 2^(-daysSinceAccess / halfLifeDays) + hitCount * hitBoost, 0, 1 )
   */
  calculateDecayScore(
    lastAccessedAt: Date,
    hitCount: number,
    config: DecayConfig,
    now: Date = new Date(),
  ): number {
    const msPerDay = 86_400_000;
    const daysSinceAccess =
      (now.getTime() - lastAccessedAt.getTime()) / msPerDay;
    const rawDecay = Math.pow(2, -daysSinceAccess / config.halfLifeDays);
    const score = rawDecay + hitCount * config.hitBoost;
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 重算所有非 frozen 记忆的衰减分。
   * 返回更新数量。
   */
  async recalcAll(userId?: string): Promise<number> {
    const memories = await this.prisma.memory.findMany({
      where: {
        frozen: false,
        ...(userId ? { userId } : {}),
      },
      select: {
        id: true,
        category: true,
        hitCount: true,
        lastAccessedAt: true,
      },
    });

    const now = new Date();
    let updated = 0;

    for (const mem of memories) {
      const config =
        DECAY_CONFIG[mem.category as MemoryCategory] ??
        DECAY_CONFIG[MemoryCategory.GENERAL];
      if (!config) continue; // frozen category — should not happen due to where clause

      const newScore = this.calculateDecayScore(
        mem.lastAccessedAt,
        mem.hitCount,
        config,
        now,
      );

      await this.prisma.memory.update({
        where: { id: mem.id },
        data: { decayScore: newScore },
      });
      updated++;
    }

    return updated;
  }

  /**
   * 获取衰减分低于阈值的候选删除记忆列表。
   */
  async getDecayCandidates(userId?: string): Promise<
    Array<{
      id: string;
      type: string;
      category: string;
      content: string;
      decayScore: number;
      hitCount: number;
      lastAccessedAt: Date;
    }>
  > {
    const memories = await this.prisma.memory.findMany({
      where: {
        frozen: false,
        ...(userId ? { userId } : {}),
      },
      select: {
        id: true,
        type: true,
        category: true,
        content: true,
        decayScore: true,
        hitCount: true,
        lastAccessedAt: true,
      },
      orderBy: { decayScore: 'asc' },
    });

    return memories.filter((m) => {
      const config =
        DECAY_CONFIG[m.category as MemoryCategory] ??
        DECAY_CONFIG[MemoryCategory.GENERAL];
      if (!config) return false;
      return m.decayScore < config.minScore;
    });
  }

  /**
   * 记录一次命中：hitCount++ 并刷新 lastAccessedAt。
   */
  async recordHit(memoryId: string): Promise<void> {
    await this.prisma.memory.update({
      where: { id: memoryId },
      data: {
        hitCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  }

  /**
   * 批量记录命中（召回多条记忆后使用）。
   */
  async recordHits(memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) return;
    const now = new Date();
    await this.prisma.$transaction(
      memoryIds.map((id) =>
        this.prisma.memory.update({
          where: { id },
          data: {
            hitCount: { increment: 1 },
            lastAccessedAt: now,
          },
        }),
      ),
    );
  }

  /**
   * 软删除：将 decayScore 设为 0，不物理删除（保留回溯能力）。
   */
  async softDelete(memoryId: string): Promise<void> {
    await this.prisma.memory.update({
      where: { id: memoryId },
      data: { decayScore: 0, confidence: 0 },
    });
  }

  /**
   * 物理删除一批记忆（用户确认后调用）。
   */
  async cleanup(memoryIds: string[], userId?: string): Promise<number> {
    if (memoryIds.length === 0) return 0;
    const result = await this.prisma.memory.deleteMany({
      where: {
        id: { in: memoryIds },
        ...(userId ? { userId } : {}),
      },
    });
    return result.count;
  }
}
