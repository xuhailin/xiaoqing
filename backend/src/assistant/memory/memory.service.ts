import type { Memory } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import {
  CATEGORY_RECALL_WEIGHT,
  COGNITIVE_CATEGORIES,
  MemoryCategory,
  VALID_CATEGORIES,
} from './memory-category';
import type { IMemoryRecaller, RecallCandidate, RecallContext, RecallResult } from './memory-recaller.interface';

export type MemoryCandidate = RecallCandidate;

@Injectable()
export class MemoryService implements IMemoryRecaller {
  constructor(private prisma: PrismaService) {}

  isReady(): boolean {
    return true;
  }

  getStrategyName(): 'keyword' {
    return 'keyword';
  }

  async recall(ctx: RecallContext): Promise<RecallResult> {
    const candidates = await this.getCandidatesForRecall({
      userId: ctx.userId,
      recentMessages: ctx.recentUserMessages.map((content) => ({ role: 'user', content })),
      maxMid: ctx.maxMid,
      maxLong: ctx.maxLong,
    });

    const midIds = candidates
      .filter((candidate) => candidate.type === 'mid')
      .slice(0, ctx.maxMid)
      .map((candidate) => candidate.id);
    const longIds = candidates
      .filter((candidate) => candidate.type === 'long' && !candidate.deferred)
      .slice(0, ctx.maxLong)
      .map((candidate) => candidate.id);

    const [midMemories, longMemories] = await Promise.all([
      this.findMemoriesInOrder(midIds),
      this.findMemoriesInOrder(longIds),
    ]);

    return {
      midMemories,
      longMemories,
      candidatesCount: candidates.length,
    };
  }

  async list(userId: string, type?: 'mid' | 'long', category?: string) {
    const where: Record<string, unknown> = {};
    where.userId = userId;
    if (type) where.type = type;
    if (category) where.category = category;
    return this.prisma.memory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string) {
    return this.prisma.memory.findUnique({
      where: { id },
    });
  }

  async update(
    id: string,
    data: { content?: string; confidence?: number; sourceMessageIds?: string[] },
  ) {
    return this.prisma.memory.update({
      where: { id },
      data: {
        ...(data.content !== undefined && { content: data.content }),
        ...(data.confidence !== undefined && { confidence: data.confidence }),
        ...(data.sourceMessageIds !== undefined && {
          sourceMessageIds: data.sourceMessageIds,
        }),
      },
    });
  }

  async deleteOne(id: string) {
    return this.prisma.memory.delete({
      where: { id },
    });
  }

  async create(data: {
    type: 'mid' | 'long';
    content: string;
    sourceMessageIds: string[];
    confidence?: number;
    category?: string;
    frozen?: boolean;
    correctedMemoryId?: string;
    userId?: string;
  }) {
    const category = data.category ?? MemoryCategory.GENERAL;
    const frozen =
      data.frozen ?? category === MemoryCategory.IDENTITY_ANCHOR;
    return this.prisma.memory.create({
      data: {
        type: data.type,
        userId: data.userId ?? 'default-user',
        category,
        content: data.content,
        sourceMessageIds: data.sourceMessageIds ?? [],
        confidence: data.confidence ?? 1,
        frozen,
        correctedMemoryId: data.correctedMemoryId,
      },
    });
  }

  /**
   * 获取已有长期认知条目（判断模式/价值排序/关系节奏），供记忆分析引擎判似。
   */
  async getExistingCognitiveMemories(userId: string): Promise<Array<{ id: string; content: string }>> {
    const list = await this.prisma.memory.findMany({
      where: {
        userId,
        type: 'long',
        category: { in: COGNITIVE_CATEGORIES },
        decayScore: { gt: 0 },
      },
      select: { id: true, content: true },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });
    return list;
  }

  /**
   * 按类别查询记忆。
   */
  async findByCategory(userId: string, category: string) {
    if (!VALID_CATEGORIES.includes(category)) return [];
    return this.prisma.memory.findMany({
      where: { userId, category },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 仅提升已有记忆的置信度（记忆分析引擎判似后「不新增、只加置信度」时使用）。
   */
  async bumpConfidence(
    id: string,
    delta: number,
  ): Promise<{ id: string; confidence: number } | null> {
    const mem = await this.prisma.memory.findUnique({
      where: { id },
      select: { confidence: true },
    });
    if (!mem) return null;
    const next = Math.min(1, mem.confidence + delta);
    await this.prisma.memory.update({
      where: { id },
      data: { confidence: next, lastAccessedAt: new Date() },
    });
    return { id, confidence: next };
  }

  /**
   * 合并内容到已有记忆（追加 + hitCount++）。
   */
  async mergeInto(
    targetId: string,
    additionalContent: string,
    newSourceMessageIds: string[],
  ) {
    const target = await this.prisma.memory.findUnique({
      where: { id: targetId },
    });
    if (!target) return null;
    const mergedContent = `${target.content}\n${additionalContent}`;
    const mergedSources = [
      ...new Set([...target.sourceMessageIds, ...newSourceMessageIds]),
    ];
    return this.prisma.memory.update({
      where: { id: targetId },
      data: {
        content: mergedContent,
        sourceMessageIds: mergedSources,
        hitCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  }

  /**
   * 从文本中提取关键词（支持 CJK bigram + 拉丁词）
   */
  private extractKeywords(text: string): Set<string> {
    const keywords = new Set<string>();
    const tokens = text
      .toLowerCase()
      .split(/[\s！？，。、；：""''【】《》（）\-_.,!?;:'"()[\]{}]+/)
      .filter(Boolean);

    for (const token of tokens) {
      if (token.length === 0) continue;
      const isCjk = /[\u4e00-\u9fff\u3040-\u30ff]/.test(token);
      if (isCjk) {
        // CJK bigram
        for (let i = 0; i < token.length - 1; i++) {
          keywords.add(token.slice(i, i + 2));
        }
        if (token.length === 1) keywords.add(token);
      } else {
        if (token.length >= 2) keywords.add(token);
      }
    }
    return keywords;
  }

  /** Jaccard 相似度：queryKeywords ∩ textKeywords / queryKeywords ∪ textKeywords */
  private keywordOverlapScore(queryKws: Set<string>, text: string): number {
    const textKws = this.extractKeywords(text);
    if (queryKws.size === 0 || textKws.size === 0) return 0;
    let overlap = 0;
    for (const kw of queryKws) {
      if (textKws.has(kw)) overlap++;
    }
    const union = new Set([...queryKws, ...textKws]).size;
    return overlap / union;
  }

  /**
   * 两阶段候选集召回：规则初筛 + 多轮上下文关键词加权评分。
   * 替代原有 getForInjection 的全量盲注，候选结果交由 PromptRouterService 做精排与 budget 截断。
   */
  async getCandidatesForRecall(opts: {
    userId: string;
    recentMessages: Array<{ role: string; content: string }>;
    maxLong?: number;
    maxMid?: number;
    minRelevanceScore?: number;
  }): Promise<MemoryCandidate[]> {
    const maxLong = opts.maxLong ?? 15;
    const maxMid = opts.maxMid ?? 20;
    const minRelevanceScore = opts.minRelevanceScore ?? 0.05;

    // 取最近 5 轮用户消息构建 query 上下文
    const contextText = opts.recentMessages
      .filter((m) => m.role === 'user')
      .slice(-5)
      .map((m) => m.content)
      .join(' ');
    const queryKws = this.extractKeywords(contextText);

    // 排除已软删除（decayScore=0）的记忆；identity_anchor 已迁移到独立表
    const [longList, midList] = await Promise.all([
      this.prisma.memory.findMany({
        where: {
          userId: opts.userId,
          type: 'long',
          decayScore: { gt: 0 },
        },
        orderBy: { confidence: 'desc' },
        take: maxLong * 2,
      }),
      this.prisma.memory.findMany({
        where: {
          userId: opts.userId,
          type: 'mid',
          decayScore: { gt: 0 },
        },
        orderBy: [{ createdAt: 'desc' }, { confidence: 'desc' }],
        take: maxMid,
      }),
    ]);

    // Long memory：confidence + 关键词 + category 权重 + decayScore
    const scoredLong: MemoryCandidate[] = longList
      .map((m) => {
        const kwScore = this.keywordOverlapScore(queryKws, m.content);
        const catWeight =
          CATEGORY_RECALL_WEIGHT[m.category as MemoryCategory] ??
          CATEGORY_RECALL_WEIGHT[MemoryCategory.GENERAL];
        const baseScore = 0.6 * m.confidence + 0.4 * kwScore;
        const score = baseScore * catWeight * m.decayScore;
        return {
          id: m.id,
          type: m.type,
          category: m.category,
          content: m.content,
          shortSummary: m.shortSummary,
          confidence: m.confidence,
          score,
          deferred: kwScore < minRelevanceScore,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLong);

    // Mid memory：时间近度 + confidence + 关键词 + category 权重 + decayScore
    const total = midList.length;
    const scoredMid: MemoryCandidate[] = midList.map((m, idx) => {
      const kwScore = this.keywordOverlapScore(queryKws, m.content);
      const timeDecay = total > 1 ? 1 - idx / (total - 1) : 1;
      const catWeight =
        CATEGORY_RECALL_WEIGHT[m.category as MemoryCategory] ??
        CATEGORY_RECALL_WEIGHT[MemoryCategory.GENERAL];
      const baseScore =
        0.4 * m.confidence + 0.3 * timeDecay + 0.3 * kwScore;
      const score = baseScore * catWeight * m.decayScore;
      return {
        id: m.id,
        type: m.type,
        category: m.category,
        content: m.content,
        shortSummary: m.shortSummary,
        confidence: m.confidence,
        score,
        deferred: false,
      };
    });

    // Mid 优先（时间近），Long 排后
    return [...scoredMid, ...scoredLong];
  }

  async recallCandidates(
    ctx: RecallContext & { minRelevanceScore?: number },
  ): Promise<MemoryCandidate[]> {
    return this.getCandidatesForRecall({
      userId: ctx.userId,
      recentMessages: ctx.recentUserMessages.map((content) => ({ role: 'user', content })),
      maxLong: ctx.maxLong,
      maxMid: ctx.maxMid,
      minRelevanceScore: ctx.minRelevanceScore,
    });
  }

  /**
   * C1: 跨对话话题关联 — 基于已召回记忆的 category + keyword 找相关记忆。
   * 用途：补充未被直接关键词命中但话题相关的记忆（如"工作压力"关联"失眠"）。
   */
  async getRelatedMemories(
    userId: string,
    recalledIds: string[],
    maxRelated: number = 5,
  ): Promise<MemoryCandidate[]> {
    if (recalledIds.length === 0) return [];

    // 获取已召回记忆的内容和分类
    const recalled = await this.prisma.memory.findMany({
      where: { id: { in: recalledIds }, userId },
      select: { id: true, category: true, content: true },
    });
    if (recalled.length === 0) return [];

    // 合并已召回记忆的关键词
    const combinedKws = new Set<string>();
    const categories = new Set<string>();
    for (const m of recalled) {
      categories.add(m.category);
      for (const kw of this.extractKeywords(m.content)) {
        combinedKws.add(kw);
      }
    }

    // 查找相同分类的其他活跃记忆
    const candidates = await this.prisma.memory.findMany({
      where: {
        userId,
        id: { notIn: recalledIds },
        category: { in: [...categories] },
        decayScore: { gt: 0 },
      },
      take: maxRelated * 3, // 多取后评分筛选
    });

    // 按关键词重叠评分
    const scored: MemoryCandidate[] = candidates
      .map((m) => {
        const kwScore = this.keywordOverlapScore(combinedKws, m.content);
        const catWeight =
          CATEGORY_RECALL_WEIGHT[m.category as MemoryCategory] ??
          CATEGORY_RECALL_WEIGHT[MemoryCategory.GENERAL];
        return {
          id: m.id,
          type: m.type,
          category: m.category,
          content: m.content,
          shortSummary: m.shortSummary,
          confidence: m.confidence,
          score: kwScore * catWeight * m.decayScore,
          deferred: false,
        };
      })
      .filter((m) => m.score > 0.02) // 最低关联阈值
      .sort((a, b) => b.score - a.score)
      .slice(0, maxRelated);

    return scored;
  }

  /**
   * Phase2: 供对话前注入用。最近 K 条 mid + 全部 long。
   * 保留作为 FEATURE_KEYWORD_PREFILTER=false 时的 fallback。
   */
  async getForInjection(userId: string, midK: number): Promise<
    Array<{ id: string; type: string; content: string }>
  > {
    const [midList, longList] = await Promise.all([
      this.prisma.memory.findMany({
        where: { userId, type: 'mid' },
        orderBy: { createdAt: 'desc' },
        take: midK,
      }),
      this.prisma.memory.findMany({
        where: { userId, type: 'long' },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const orderedMid = midList.reverse();
    return [
      ...orderedMid.map((m) => ({ id: m.id, type: m.type, content: m.content })),
      ...longList.map((m) => ({ id: m.id, type: m.type, content: m.content })),
    ];
  }

  private async findMemoriesInOrder(ids: string[]): Promise<Memory[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.memory.findMany({
      where: { id: { in: ids } },
    });
    const rowMap = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => rowMap.get(id)).filter((row): row is Memory => Boolean(row));
  }
}
