import { Injectable, Logger } from '@nestjs/common';
import type { OpenAI } from 'openai';
import { LlmService } from '../../../infra/llm/llm.service';
import { PrismaService } from '../../../infra/prisma.service';
import type {
  SocialEntityClassificationResult,
  SocialEntityClassifyBatchResult,
  SocialEntityRecord,
  SocialRelation,
} from './social-entity.types';
import { SocialEntityService } from './social-entity.service';

const CLASSIFICATION_PROMPT = `你是小晴的社会人物分类器。给定一个人物实体和相关对话碎片，请谨慎判断此人的关系类型、生成一句认知描述，并给出可能的别名。

规则：
1. relation 只能是 family | friend | colleague | romantic | pet | other
2. description 必须是一句中文，简短、克制，不要编造没有证据的细节
3. aliasHints 只返回你有把握的别名，最多 3 个；没有就返回 []
4. confidence 范围 0~1；证据弱时低于 0.7
5. 如果当前 name 已经足够稳定，不要把它自己重复塞进 aliasHints

返回 JSON（不要代码块，不要解释）：
{
  "relation": "family",
  "description": "用户的妈妈，最近多次出现在家庭关系话题里。",
  "confidence": 0.82,
  "aliasHints": ["我妈", "老妈"]
}`;

@Injectable()
export class SocialEntityClassifierService {
  private readonly logger = new Logger(SocialEntityClassifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly socialEntity: SocialEntityService,
  ) {}

  async classifyPending(options?: {
    userId?: string;
    entityIds?: string[];
    limit?: number;
    force?: boolean;
  }): Promise<SocialEntityClassifyBatchResult> {
    const rows = await this.prisma.socialEntity.findMany({
      where: {
        ...(options?.userId ? { userId: options.userId } : {}),
        ...(options?.entityIds?.length ? { id: { in: options.entityIds } } : {}),
        mentionCount: { gte: 3 },
        ...(options?.force
          ? {}
          : {
              OR: [
                { relation: 'other' },
                { description: null },
              ],
            }),
      },
      orderBy: [{ mentionCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: options?.limit ?? 6,
    });

    let classified = 0;
    let merged = 0;
    const entityIds: string[] = [];

    for (const row of rows) {
      const result = await this.classifyEntity(row.id, { force: options?.force });
      if (!result) continue;
      classified++;
      if (result.merged) merged++;
      entityIds.push(result.entity.id);
    }

    return {
      classified,
      merged,
      total: classified,
      entityIds: [...new Set(entityIds)],
    };
  }

  async classifyEntity(
    id: string,
    options?: { force?: boolean },
  ): Promise<{ entity: SocialEntityRecord; merged: boolean } | null> {
    const entity = await this.prisma.socialEntity.findUnique({ where: { id } });
    if (!entity) return null;

    if (!options?.force && entity.mentionCount < 3) {
      return null;
    }

    const traces = await this.prisma.tracePoint.findMany({
      where: {
        OR: [
          { people: { has: entity.name } },
          ...entity.aliases.map((alias) => ({ people: { has: alias } })),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 16,
      select: {
        content: true,
        people: true,
        createdAt: true,
      },
    });

    if (traces.length === 0) {
      return null;
    }

    const classification = await this.callLlm(entity, traces);
    if (!classification) {
      return null;
    }

    let targetId = entity.id;
    let merged = false;
    if (classification.confidence >= 0.85 && classification.aliasHints.length > 0) {
      const autoMerge = await this.tryAutoMerge(entity, classification.aliasHints);
      if (autoMerge) {
        targetId = autoMerge.id;
        merged = true;
      }
    }

    const current = await this.prisma.socialEntity.findUniqueOrThrow({ where: { id: targetId } });
    const nextAliases = [
      ...new Set(
        [...current.aliases, ...classification.aliasHints]
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ].filter((item) => item !== current.name);

    const updated = await this.prisma.socialEntity.update({
      where: { id: targetId },
      data: {
        relation: classification.relation,
        description: classification.description,
        aliases: nextAliases,
      },
    });

    this.logger.log(
      `SocialEntity classified: ${updated.name} -> relation=${updated.relation}, confidence=${classification.confidence.toFixed(2)}`,
    );

    return {
      entity: {
        id: updated.id,
        name: updated.name,
        aliases: updated.aliases,
        relation: updated.relation as SocialRelation,
        description: updated.description,
        firstSeenAt: updated.firstSeenAt,
        lastSeenAt: updated.lastSeenAt,
        mentionCount: updated.mentionCount,
        tags: updated.tags,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
      merged,
    };
  }

  private async tryAutoMerge(
    entity: {
      id: string;
      userId: string;
      name: string;
      aliases: string[];
      mentionCount: number;
    },
    aliasHints: string[],
  ) {
    for (const alias of aliasHints) {
      const trimmed = alias.trim();
      if (!trimmed || trimmed === entity.name || entity.aliases.includes(trimmed)) continue;

      const matched = await this.prisma.socialEntity.findFirst({
        where: {
          id: { not: entity.id },
          userId: entity.userId,
          OR: [
            { name: trimmed },
            { aliases: { has: trimmed } },
          ],
        },
      });
      if (!matched) continue;

      const targetId = matched.mentionCount > entity.mentionCount ? matched.id : entity.id;
      const sourceId = targetId === entity.id ? matched.id : entity.id;
      const merged = await this.socialEntity.merge(sourceId, targetId);
      this.logger.log(`SocialEntity auto-merged by alias hint "${trimmed}" -> ${merged.name}`);
      return merged;
    }

    return null;
  }

  private async callLlm(
    entity: {
      name: string;
      aliases: string[];
      mentionCount: number;
    },
    traces: Array<{
      content: string;
      people: string[];
      createdAt: Date;
    }>,
  ): Promise<SocialEntityClassificationResult | null> {
    const traceSummary = traces
      .slice(0, 10)
      .map((trace) => `- ${trace.content}${trace.people.length > 0 ? `（涉及：${trace.people.join('、')}）` : ''}`)
      .join('\n');

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: '你只输出合法 JSON 对象，不要代码块，不要解释。' },
      {
        role: 'user',
        content: `${CLASSIFICATION_PROMPT}

实体：
- name=${entity.name}
- aliases=${entity.aliases.join('、') || '无'}
- mentionCount=${entity.mentionCount}

相关对话碎片：
${traceSummary}`,
      },
    ];

    try {
      const raw = await this.llm.generate(messages, { scenario: 'summary' });
      return this.parseClassification(raw);
    } catch (err) {
      this.logger.warn(`SocialEntity classification failed: ${String(err)}`);
      return null;
    }
  }

  private parseClassification(raw: string): SocialEntityClassificationResult | null {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart < 0 || objEnd <= objStart) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>;
    } catch {
      this.logger.warn('Failed to parse SocialEntity classification JSON');
      return null;
    }

    const relation = String(parsed.relation ?? '').trim();
    const validRelations: SocialRelation[] = ['family', 'friend', 'colleague', 'romantic', 'pet', 'other'];
    if (!validRelations.includes(relation as SocialRelation)) {
      return null;
    }

    const description = String(parsed.description ?? '').trim().slice(0, 240);
    if (!description) {
      return null;
    }

    const aliasHints = Array.isArray(parsed.aliasHints)
      ? [...new Set(
          parsed.aliasHints
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        )].slice(0, 3)
      : [];

    return {
      relation: relation as SocialRelation,
      description,
      confidence: this.clampConfidence(parsed.confidence),
      aliasHints,
    };
  }

  private clampConfidence(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0.5;
    return Math.max(0, Math.min(1, Math.round(num * 100) / 100));
  }
}
