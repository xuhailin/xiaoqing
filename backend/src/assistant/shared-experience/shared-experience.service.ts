import { Injectable, Logger } from '@nestjs/common';
import type { OpenAI } from 'openai';
import { PrismaService } from '../../infra/prisma.service';
import { LlmService } from '../../infra/llm/llm.service';
import { SessionReflectionService } from '../session-reflection/session-reflection.service';
import type { SessionReflectionRecord } from '../session-reflection/session-reflection.types';
import type {
  SharedExperienceCategory,
  SharedExperiencePromoteResult,
  SharedExperienceQuery,
  SharedExperienceRecord,
  SharedExperienceTone,
} from './shared-experience.types';

const VALID_CATEGORIES: SharedExperienceCategory[] = [
  'emotional_support',
  'co_thinking',
  'celebration',
  'crisis',
  'milestone',
  'daily_ritual',
];

const VALID_TONES: SharedExperienceTone[] = ['warm', 'bittersweet', 'proud', 'relieved'];

const PROMOTION_PROMPT = `你是小晴的共同经历提炼器。给定一次 SessionReflection 和相关对话碎片，请判断这段经历应该如何被记录为"小晴与用户的共同经历"。

规则：
1. 只基于提供的信息，不要编造细节
2. title 要短，像时间线条目
3. summary 要写成一句简短叙事，突出"我们一起经历了什么"
4. category 只能是 emotional_support / co_thinking / celebration / crisis / milestone / daily_ritual
5. emotionalTone 只能是 warm / bittersweet / proud / relieved，拿不准就返回 null
6. significance 范围 0~1；真正重要的经历才高于 0.7

返回 JSON 对象（不要代码块，不要解释）：
{
  "title": "共同经历标题",
  "summary": "一句简短叙事",
  "category": "emotional_support",
  "emotionalTone": "warm" | null,
  "significance": 0.72
}`;

interface PromoteCandidate {
  title: string;
  summary: string;
  category: SharedExperienceCategory;
  emotionalTone: SharedExperienceTone | null;
  significance: number;
  happenedAt: Date;
  conversationIds: string[];
  relatedEntityIds: string[];
}

@Injectable()
export class SharedExperienceService {
  private readonly logger = new Logger(SharedExperienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly sessionReflection: SessionReflectionService,
  ) {}

  async promoteFromReflections(since?: Date): Promise<SharedExperiencePromoteResult> {
    const reflections = await this.sessionReflection.getSharedMomentCandidates(since);
    if (reflections.length === 0) {
      return { created: 0, updated: 0, skipped: 0, total: 0 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const reflection of reflections) {
      const existingByConversation = await this.prisma.sharedExperience.findFirst({
        where: { conversationIds: { has: reflection.conversationId } },
        select: { id: true },
      });
      if (existingByConversation) {
        skipped++;
        continue;
      }

      const candidate = await this.buildCandidate(reflection);
      if (!candidate) {
        skipped++;
        continue;
      }

      const continuation = await this.findContinuation(candidate);
      if (continuation) {
        await this.prisma.sharedExperience.update({
          where: { id: continuation.id },
          data: {
            summary:
              candidate.significance >= continuation.significance
                ? candidate.summary
                : continuation.summary,
            significance: Math.max(continuation.significance, candidate.significance),
            emotionalTone: continuation.emotionalTone ?? candidate.emotionalTone,
            conversationIds: this.uniq([...continuation.conversationIds, ...candidate.conversationIds]),
            relatedEntityIds: this.uniq([
              ...continuation.relatedEntityIds,
              ...candidate.relatedEntityIds,
            ]),
            happenedAt:
              candidate.happenedAt < continuation.happenedAt
                ? candidate.happenedAt
                : continuation.happenedAt,
          },
        });
        updated++;
        continue;
      }

      await this.prisma.sharedExperience.create({ data: candidate });
      created++;
    }

    this.logger.log(
      `SharedExperience promote: reflections=${reflections.length}, created=${created}, updated=${updated}, skipped=${skipped}`,
    );

    return {
      created,
      updated,
      skipped,
      total: reflections.length,
    };
  }

  async list(userId: string, query?: SharedExperienceQuery): Promise<SharedExperienceRecord[]> {
    const where: Record<string, unknown> = { userId };
    if (query?.category) where.category = query.category;
    if (typeof query?.minSignificance === 'number') {
      where.significance = { gte: this.clampSignificance(query.minSignificance) };
    }

    const rows = await this.prisma.sharedExperience.findMany({
      where,
      orderBy: [{ significance: 'desc' }, { happenedAt: 'desc' }],
      take: query?.limit ?? 50,
    });

    return rows.map((row) => this.toRecord(row));
  }

  async findRelevant(userId: string, context: string, limit = 3): Promise<SharedExperienceRecord[]> {
    const rows = await this.prisma.sharedExperience.findMany({
      where: { userId },
      orderBy: [{ significance: 'desc' }, { happenedAt: 'desc' }],
      take: 100,
    });

    if (!context.trim()) {
      return rows.slice(0, limit).map((row) => this.toRecord(row));
    }

    return rows
      .map((row) => ({
        row,
        score: this.computeRelevanceScore(context, {
          title: row.title,
          summary: row.summary,
          significance: row.significance,
          happenedAt: row.happenedAt,
        }),
      }))
      .filter((item) => item.score > 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => this.toRecord(item.row));
  }

  async merge(sourceId: string, targetId: string): Promise<SharedExperienceRecord> {
    const [source, target] = await Promise.all([
      this.prisma.sharedExperience.findUniqueOrThrow({ where: { id: sourceId } }),
      this.prisma.sharedExperience.findUniqueOrThrow({ where: { id: targetId } }),
    ]);

    const merged = await this.prisma.sharedExperience.update({
      where: { id: targetId },
      data: {
        title: target.significance >= source.significance ? target.title : source.title,
        summary: target.summary.length >= source.summary.length ? target.summary : source.summary,
        category: target.significance >= source.significance ? target.category : source.category,
        emotionalTone: target.emotionalTone ?? source.emotionalTone,
        significance: Math.max(target.significance, source.significance),
        happenedAt: source.happenedAt < target.happenedAt ? source.happenedAt : target.happenedAt,
        conversationIds: this.uniq([...target.conversationIds, ...source.conversationIds]),
        relatedEntityIds: this.uniq([...target.relatedEntityIds, ...source.relatedEntityIds]),
      },
    });

    await this.prisma.sharedExperience.delete({ where: { id: sourceId } });
    return this.toRecord(merged);
  }

  private async buildCandidate(
    reflection: SessionReflectionRecord,
  ): Promise<PromoteCandidate | null> {
    const tracePoints = await this.prisma.tracePoint.findMany({
      where: { conversationId: reflection.conversationId },
      orderBy: { createdAt: 'asc' },
      take: 12,
      select: {
        content: true,
        people: true,
        happenedAt: true,
        createdAt: true,
      },
    });

    const llmResult = await this.extractCandidate(reflection, tracePoints);
    const peopleNames = this.uniq(tracePoints.flatMap((point) => point.people));
    const relatedEntityIds = await this.resolveRelatedEntityIds(peopleNames);

    const firstMoment = tracePoints
      .map((point) => point.happenedAt ?? point.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    return {
      title: llmResult?.title ?? this.buildFallbackTitle(reflection),
      summary: llmResult?.summary ?? reflection.momentHint ?? reflection.summary,
      category: llmResult?.category ?? this.inferFallbackCategory(reflection),
      emotionalTone: llmResult?.emotionalTone ?? null,
      significance: llmResult?.significance ?? 0.6,
      happenedAt: firstMoment ?? reflection.createdAt,
      conversationIds: [reflection.conversationId],
      relatedEntityIds,
    };
  }

  private async extractCandidate(
    reflection: SessionReflectionRecord,
    tracePoints: Array<{
      content: string;
      people: string[];
      happenedAt: Date | null;
      createdAt: Date;
    }>,
  ): Promise<Pick<PromoteCandidate, 'title' | 'summary' | 'category' | 'emotionalTone' | 'significance'> | null> {
    const traceSummary = tracePoints
      .slice(0, 6)
      .map((point) => `- ${point.content}${point.people.length > 0 ? `（涉及：${point.people.join('、')}）` : ''}`)
      .join('\n');

    const llmMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: '你只输出合法 JSON 对象，不要代码块，不要解释。',
      },
      {
        role: 'user',
        content: `${PROMOTION_PROMPT}

SessionReflection:
- summary: ${reflection.summary}
- relationImpact: ${reflection.relationImpact}
- momentHint: ${reflection.momentHint ?? 'null'}

相关碎片：
${traceSummary || '- 无额外碎片'}
`,
      },
    ];

    try {
      const raw = await this.llm.generate(llmMessages, { scenario: 'summary' });
      return this.parseCandidate(raw);
    } catch (err) {
      this.logger.warn(`SharedExperience extraction failed: ${String(err)}`);
      return null;
    }
  }

  private parseCandidate(
    raw: string,
  ): Pick<PromoteCandidate, 'title' | 'summary' | 'category' | 'emotionalTone' | 'significance'> | null {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart < 0 || objEnd <= objStart) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>;
    } catch {
      this.logger.warn('Failed to parse SharedExperience JSON');
      return null;
    }

    const category = String(parsed.category ?? '').trim() as SharedExperienceCategory;
    const emotionalTone = String(parsed.emotionalTone ?? '').trim() as SharedExperienceTone;

    return {
      title: String(parsed.title ?? '').trim().slice(0, 80) || '',
      summary: String(parsed.summary ?? '').trim().slice(0, 500) || '',
      category: VALID_CATEGORIES.includes(category) ? category : 'emotional_support',
      emotionalTone: VALID_TONES.includes(emotionalTone) ? emotionalTone : null,
      significance: this.clampSignificance(parsed.significance),
    };
  }

  private async findContinuation(candidate: PromoteCandidate) {
    const windowStart = new Date(candidate.happenedAt.getTime() - 7 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(candidate.happenedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.sharedExperience.findMany({
      where: {
        category: candidate.category,
        happenedAt: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: [{ significance: 'desc' }, { happenedAt: 'desc' }],
      take: 20,
    });

    let best:
      | {
          id: string;
          summary: string;
          significance: number;
          emotionalTone: string | null;
          conversationIds: string[];
          relatedEntityIds: string[];
          happenedAt: Date;
          score: number;
        }
      | undefined;

    for (const row of rows) {
      const sharedEntityCount = row.relatedEntityIds.filter((id) =>
        candidate.relatedEntityIds.includes(id),
      ).length;
      const textScore = this.computeKeywordOverlap(
        `${candidate.title} ${candidate.summary}`,
        `${row.title} ${row.summary}`,
      );
      const score = sharedEntityCount * 1.5 + textScore;
      if (!best || score > best.score) {
        best = { ...row, score };
      }
    }

    return best && best.score >= 1.5 ? best : null;
  }

  private async resolveRelatedEntityIds(names: string[]): Promise<string[]> {
    const rows = await Promise.all(
      names.map((name) =>
        this.prisma.socialEntity.findFirst({
          where: {
            OR: [{ name }, { aliases: { has: name } }],
          },
          select: { id: true },
        }),
      ),
    );

    return this.uniq(rows.map((row) => row?.id).filter((id): id is string => Boolean(id)));
  }

  private inferFallbackCategory(reflection: SessionReflectionRecord): SharedExperienceCategory {
    if (reflection.relationImpact === 'repaired') return 'emotional_support';
    if (/庆祝|开心|高兴|好消息|顺利/.test(reflection.summary)) return 'celebration';
    if (/焦虑|难过|崩溃|撑不住|危机/.test(reflection.summary)) return 'crisis';
    if (/一起想|分析|聊了很久|想通/.test(reflection.summary + (reflection.momentHint ?? ''))) {
      return 'co_thinking';
    }
    return 'emotional_support';
  }

  private buildFallbackTitle(reflection: SessionReflectionRecord): string {
    const seed = reflection.momentHint ?? reflection.summary;
    const cleaned = seed.replace(/[，。；：,.!?！？]/g, ' ').trim();
    return cleaned.slice(0, 18) || '一次重要对话';
  }

  private computeRelevanceScore(
    context: string,
    candidate: { title: string; summary: string; significance: number; happenedAt: Date },
  ): number {
    const keywordScore = this.computeKeywordOverlap(
      context,
      `${candidate.title} ${candidate.summary}`,
    );
    const recencyScore = Math.max(
      0,
      0.3 - (Date.now() - candidate.happenedAt.getTime()) / (1000 * 60 * 60 * 24 * 120),
    );
    return keywordScore + candidate.significance * 0.6 + recencyScore;
  }

  private computeKeywordOverlap(a: string, b: string): number {
    const aKeywords = new Set(this.extractKeywords(a));
    const bKeywords = new Set(this.extractKeywords(b));
    if (aKeywords.size === 0 || bKeywords.size === 0) return 0;

    let overlap = 0;
    for (const keyword of aKeywords) {
      if (bKeywords.has(keyword)) overlap++;
    }

    return Math.min(1.5, overlap * 0.5);
  }

  private extractKeywords(text: string): string[] {
    return this.uniq(
      (text.match(/[A-Za-z0-9]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? [])
        .map((token) => token.toLowerCase())
        .filter((token) => token.length >= 2),
    );
  }

  private clampSignificance(value: unknown): number {
    const num = Number(value);
    if (Number.isNaN(num)) return 0.5;
    return Math.max(0, Math.min(1, Math.round(num * 100) / 100));
  }

  private uniq<T>(values: T[]): T[] {
    return [...new Set(values)];
  }

  private toRecord(row: {
    id: string;
    title: string;
    summary: string;
    category: string;
    emotionalTone: string | null;
    significance: number;
    happenedAt: Date;
    conversationIds: string[];
    relatedEntityIds: string[];
    createdAt: Date;
    updatedAt: Date;
  }): SharedExperienceRecord {
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      category: row.category as SharedExperienceCategory,
      emotionalTone: (row.emotionalTone as SharedExperienceTone | null) ?? null,
      significance: row.significance,
      happenedAt: row.happenedAt,
      conversationIds: row.conversationIds,
      relatedEntityIds: row.relatedEntityIds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
