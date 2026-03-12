import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import {
  CATEGORY_DUPLICATE_THRESHOLD,
  MemoryCategory,
  WriteDecision,
  type WriteCandidate,
  type WriteDecisionResult,
} from './memory-category';
import { computeSimilarity } from './memory-similarity';

/** 低于此 confidence 不写入 */
const CONFIDENCE_THRESHOLD = 0.4;

@Injectable()
export class MemoryWriteGuardService {
  constructor(private prisma: PrismaService) {}

  /**
   * 判断一条记忆候选是否应写入、覆盖、合并或跳过。
   * 规则驱动，不依赖 LLM 自主决策。
   */
  async evaluate(candidate: WriteCandidate): Promise<WriteDecisionResult> {
    // 规则 1: 不确定 → 不写入
    if (candidate.confidence < CONFIDENCE_THRESHOLD) {
      return {
        decision: WriteDecision.SKIP,
        reason: `confidence ${candidate.confidence} < threshold ${CONFIDENCE_THRESHOLD}`,
      };
    }

    // 规则 2: 明确否定 → 查找并覆盖
    if (candidate.isNegation) {
      const conflicting = await this.findConflicting(
        candidate.content,
        candidate.category,
      );
      if (conflicting) {
        return {
          decision: WriteDecision.OVERWRITE,
          targetMemoryId: conflicting.id,
          reason: `negation overwrites existing memory: ${conflicting.id}`,
        };
      }
      // 否定但找不到原条目 → 仍然写入（记录纠正方向）
      if (candidate.category === MemoryCategory.CORRECTION) {
        return {
          decision: WriteDecision.WRITE,
          reason: 'correction with no existing conflict, write as new',
        };
      }
      return {
        decision: WriteDecision.SKIP,
        reason: 'negation but no conflicting memory found',
      };
    }

    // 规则 3: 一次性事实 → 不写入长期
    if (
      candidate.category === MemoryCategory.GENERAL &&
      candidate.isOneOff &&
      candidate.type === 'long'
    ) {
      return {
        decision: WriteDecision.SKIP,
        reason: 'one-off fact should not become long-term memory',
      };
    }

    // 规则 4: 纠错 → 必须写入并关联
    if (candidate.category === MemoryCategory.CORRECTION) {
      const conflicting = await this.findConflicting(
        candidate.content,
        undefined,
      );
      return {
        decision: WriteDecision.WRITE_AND_LINK,
        targetMemoryId: conflicting?.id,
        reason: conflicting
          ? `correction linked to memory: ${conflicting.id}`
          : 'correction with no existing memory to link',
      };
    }

    // 规则 5: 重复检测 → 合并
    const duplicate = await this.findSimilar(
      candidate.content,
      candidate.category,
    );
    if (duplicate) {
      return {
        decision: WriteDecision.MERGE,
        targetMemoryId: duplicate.id,
        reason: `similar memory exists: ${duplicate.id}`,
      };
    }

    return {
      decision: WriteDecision.WRITE,
      reason: 'passed all checks',
    };
  }

  /**
   * 基于关键词查找可能冲突的记忆（用于纠错/覆盖判断）。
   * 在同 category（或全局）中查找关键词重叠度最高的一条。
   */
  private async findConflicting(
    content: string,
    category: MemoryCategory | undefined,
  ): Promise<{ id: string; content: string } | null> {
    const where: Record<string, unknown> = { frozen: false };
    if (category) where.category = category;

    const candidates = await this.prisma.memory.findMany({
      where,
      select: { id: true, content: true },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });

    const effectiveCategory = category ?? MemoryCategory.GENERAL;
    const threshold =
      CATEGORY_DUPLICATE_THRESHOLD[effectiveCategory] ??
      CATEGORY_DUPLICATE_THRESHOLD[MemoryCategory.GENERAL];
    let bestMatch: { id: string; content: string } | null = null;
    let bestScore = 0;

    for (const c of candidates) {
      const score = computeSimilarity(content, c.content, effectiveCategory).finalScore;
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = c;
      }
    }

    return bestMatch;
  }

  /**
   * 查找内容相似的已有记忆（用于合并判断）。
   */
  private async findSimilar(
    content: string,
    category: MemoryCategory,
  ): Promise<{ id: string; content: string } | null> {
    const candidates = await this.prisma.memory.findMany({
      where: { category, frozen: false },
      select: { id: true, content: true },
      take: 30,
      orderBy: { updatedAt: 'desc' },
    });

    const threshold =
      CATEGORY_DUPLICATE_THRESHOLD[category] ??
      CATEGORY_DUPLICATE_THRESHOLD[MemoryCategory.GENERAL];
    let best: { id: string; content: string } | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const score = computeSimilarity(content, c.content, category).finalScore;
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        best = c;
      }
    }

    return best;
  }
}
