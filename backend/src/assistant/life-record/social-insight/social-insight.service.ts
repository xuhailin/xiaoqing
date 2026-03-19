import { Injectable, Logger } from '@nestjs/common';
import type { OpenAI } from 'openai';
import { LlmService } from '../../../infra/llm/llm.service';
import { PrismaService } from '../../../infra/prisma.service';
import type {
  SocialInsightGenerateResult,
  SocialInsightQuery,
  SocialInsightRecord,
  SocialInsightScope,
} from './social-insight.types';

const INSIGHT_PROMPT = `你是小晴的社会洞察模块。给定用户最近提到的人物和相关生活碎片，总结一条"对用户社会世界的洞察"。

规则：
1. 洞察必须谨慎，只能基于已有信息，不要编造
2. content 用一句自然中文，像"用户最近和妈妈的互动明显增多，可能正在经历某种家庭决策"
3. relatedEntityIds 只返回输入里出现过的实体 id
4. confidence 范围 0~1；证据弱时应低于 0.6
5. 如果没有足够明显的模式，就返回 content=null
6. 如果“原始关系事件”和“SessionReflection 回流事件”指向同一趋势，可以略微提高置信度；如果只有回流事件、缺少原始证据，要更保守

返回 JSON（不要代码块，不要解释）：
{
  "content": "洞察文本" | null,
  "relatedEntityIds": ["entity-id-1"],
  "confidence": 0.68
}`;

@Injectable()
export class SocialInsightService {
  private readonly logger = new Logger(SocialInsightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async list(query?: SocialInsightQuery): Promise<SocialInsightRecord[]> {
    const where: Record<string, unknown> = {};
    if (query?.scope) where.scope = query.scope;
    if (typeof query?.minConfidence === 'number') {
      where.confidence = { gte: this.clampConfidence(query.minConfidence) };
    }

    const rows = await this.prisma.socialInsight.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: query?.limit ?? 20,
    });

    return rows.map((row) => this.toRecord(row));
  }

  async findRelevant(context: string, limit = 2): Promise<SocialInsightRecord[]> {
    const rows = await this.prisma.socialInsight.findMany({
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    if (!context.trim()) {
      return rows.slice(0, limit).map((row) => this.toRecord(row));
    }

    return rows
      .map((row) => ({
        row,
        score: this.computeRelevanceScore(context, row.content, row.confidence),
      }))
      .filter((item) => item.score > 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => this.toRecord(item.row));
  }

  async generate(scope: SocialInsightScope = 'weekly'): Promise<SocialInsightGenerateResult> {
    const period = this.resolvePeriod(scope);
    const entities = await this.prisma.socialEntity.findMany({
      orderBy: [{ mentionCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: scope === 'weekly' ? 6 : 10,
      select: {
        id: true,
        name: true,
        relation: true,
        description: true,
        mentionCount: true,
        lastSeenAt: true,
      },
    });

    if (entities.length === 0) {
      return { created: false, record: null };
    }

    const since = period.since;
    const entityNames = entities.map((entity) => entity.name);
    const [tracePoints, edges] = await Promise.all([
      this.prisma.tracePoint.findMany({
        where: {
          createdAt: { gte: since },
          people: { hasSome: entityNames },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          content: true,
          people: true,
          kind: true,
          tags: true,
          extractedBy: true,
          createdAt: true,
        },
      }),
      this.prisma.socialRelationEdge.findMany({
        where: {
          toEntityId: { in: entities.map((entity) => entity.id) },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 10,
        select: {
          toEntityId: true,
          quality: true,
          trend: true,
          notes: true,
        },
      }),
    ]);

    const llmResult = await this.generateWithLlm(period.periodKey, scope, entities, tracePoints, edges);
    const fallback = this.generateFallbackInsight(entities, tracePoints);
    const next = llmResult ?? fallback;

    if (!next?.content) {
      return { created: false, record: null };
    }

    const row = await this.prisma.socialInsight.upsert({
      where: {
        scope_periodKey: {
          scope,
          periodKey: period.periodKey,
        },
      },
      update: {
        content: next.content,
        relatedEntityIds: next.relatedEntityIds,
        confidence: next.confidence,
      },
      create: {
        scope,
        periodKey: period.periodKey,
        content: next.content,
        relatedEntityIds: next.relatedEntityIds,
        confidence: next.confidence,
      },
    });

    this.logger.log(
      `SocialInsight generated: scope=${scope}, period=${period.periodKey}, confidence=${row.confidence.toFixed(2)}`,
    );

    return { created: true, record: this.toRecord(row) };
  }

  private async generateWithLlm(
    periodKey: string,
    scope: SocialInsightScope,
    entities: Array<{
      id: string;
      name: string;
      relation: string;
      description: string | null;
      mentionCount: number;
      lastSeenAt: Date;
    }>,
    tracePoints: Array<{
      content: string;
      people: string[];
      kind: string;
      tags: string[];
      extractedBy: string;
      createdAt: Date;
    }>,
    edges: Array<{
      toEntityId: string;
      quality: number;
      trend: string;
      notes: string | null;
    }>,
  ): Promise<Pick<SocialInsightRecord, 'content' | 'relatedEntityIds' | 'confidence'> | null> {
    const entitySummary = entities
      .map((entity) => `- ${entity.id} | ${entity.name} | relation=${entity.relation} | mentions=${entity.mentionCount} | desc=${entity.description ?? 'null'}`)
      .join('\n');
    const traceGroups = this.splitTracePointSources(tracePoints);
    const generalTraceSummary = traceGroups.general
      .slice(0, 8)
      .map((point) => `- ${point.content}${point.people.length > 0 ? `（涉及：${point.people.join('、')}）` : ''}`)
      .join('\n');
    const directRelationSummary = traceGroups.directRelationEvents
      .slice(0, 6)
      .map((point) => `- ${point.content}${point.people.length > 0 ? `（涉及：${point.people.join('、')}）` : ''}`)
      .join('\n');
    const reflectedRelationSummary = traceGroups.reflectedRelationEvents
      .slice(0, 6)
      .map((point) => `- ${point.content}${point.people.length > 0 ? `（涉及：${point.people.join('、')}）` : ''}`)
      .join('\n');
    const edgeSummary = edges
      .map((edge) => `- entity=${edge.toEntityId} | quality=${edge.quality.toFixed(2)} | trend=${edge.trend} | note=${edge.notes ?? 'null'}`)
      .join('\n');

    const llmMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: '你只输出合法 JSON 对象，不要代码块，不要解释。' },
      {
        role: 'user',
        content: `${INSIGHT_PROMPT}

scope=${scope}
periodKey=${periodKey}

人物：
${entitySummary}

生活碎片：
${generalTraceSummary || '- 无'}

原始关系事件（直接来自对话抽点）：
${directRelationSummary || '- 无'}

SessionReflection 回流的关系事件：
${reflectedRelationSummary || '- 无'}

关系趋势：
${edgeSummary || '- 无'}
`,
      },
    ];

    try {
      const raw = await this.llm.generate(llmMessages, { scenario: 'summary' });
      return this.parseInsight(raw, entities.map((entity) => entity.id));
    } catch (err) {
      this.logger.warn(`SocialInsight generation failed: ${String(err)}`);
      return null;
    }
  }

  private parseInsight(
    raw: string,
    allowedEntityIds: string[],
  ): Pick<SocialInsightRecord, 'content' | 'relatedEntityIds' | 'confidence'> | null {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart < 0 || objEnd <= objStart) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>;
    } catch {
      this.logger.warn('Failed to parse SocialInsight JSON');
      return null;
    }

    const content =
      typeof parsed.content === 'string' ? parsed.content.trim().slice(0, 400) : '';
    const relatedEntityIds = Array.isArray(parsed.relatedEntityIds)
      ? parsed.relatedEntityIds
          .filter((id): id is string => typeof id === 'string')
          .filter((id) => allowedEntityIds.includes(id))
      : [];

    if (!content) return null;

    return {
      content,
      relatedEntityIds: [...new Set(relatedEntityIds)],
      confidence: this.clampConfidence(parsed.confidence),
    };
  }

  private generateFallbackInsight(
    entities: Array<{
      id: string;
      name: string;
      relation: string;
      mentionCount: number;
      lastSeenAt: Date;
    }>,
    tracePoints: Array<{
      content: string;
      people: string[];
      kind: string;
      tags: string[];
      extractedBy: string;
      createdAt: Date;
    }>,
  ): Pick<SocialInsightRecord, 'content' | 'relatedEntityIds' | 'confidence'> | null {
    const top = entities[0];
    if (!top) return null;

    const related = tracePoints.filter((point) => point.people.includes(top.name));
    const relationEvents = related.filter((point) => point.kind === 'relation_event');
    const reflectedEvents = relationEvents.filter((point) => this.isReflectionBridgePoint(point.tags));
    const directEvents = relationEvents.filter((point) => !this.isReflectionBridgePoint(point.tags));
    if (related.length < 2 && top.mentionCount < 3) {
      return null;
    }

    const recentSignals = related.slice(0, 3).map((point) => point.content).join('；');
    const relationPrefix = directEvents.length > 0 && reflectedEvents.length > 0
      ? `用户最近和${top.name}的关系波动在多处信号里重复出现，`
      : directEvents.length > 0
        ? `用户最近直接提到和${top.name}的关系变化，`
        : reflectedEvents.length > 0
          ? `最近的对话回顾显示，${top.name}这段关系可能值得关注，`
          : '';
    return {
      content:
        top.relation === 'family'
          ? `${relationPrefix || `用户最近频繁提到${top.name}，`}家庭关系可能正在成为这段时间的重要背景。`
          : `${relationPrefix || `用户最近和${top.name}的互动明显增多，`}这段关系可能正在影响当前状态。${recentSignals ? `线索包括：${recentSignals}` : ''}`,
      relatedEntityIds: [top.id],
      confidence:
        directEvents.length > 0 && reflectedEvents.length > 0
          ? 0.68
          : directEvents.length > 0
            ? 0.61
            : top.mentionCount >= 5
              ? 0.58
              : 0.52,
    };
  }

  private splitTracePointSources(
    tracePoints: Array<{
      content: string;
      people: string[];
      kind: string;
      tags: string[];
      extractedBy: string;
      createdAt: Date;
    }>,
  ) {
    const general: typeof tracePoints = [];
    const directRelationEvents: typeof tracePoints = [];
    const reflectedRelationEvents: typeof tracePoints = [];

    for (const point of tracePoints) {
      if (point.kind === 'relation_event') {
        if (this.isReflectionBridgePoint(point.tags)) {
          reflectedRelationEvents.push(point);
        } else {
          directRelationEvents.push(point);
        }
        continue;
      }
      general.push(point);
    }

    return { general, directRelationEvents, reflectedRelationEvents };
  }

  private isReflectionBridgePoint(tags: string[]): boolean {
    return tags.includes('session_reflection') || tags.includes('relation_bridge');
  }

  private resolvePeriod(scope: SocialInsightScope): { periodKey: string; since: Date } {
    const now = new Date();
    if (scope === 'monthly') {
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      return {
        periodKey: `${year}-${month}`,
        since: new Date(Date.UTC(year, now.getUTCMonth(), 1, 0, 0, 0)),
      };
    }

    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekday = day.getUTCDay() || 7;
    const monday = new Date(day);
    monday.setUTCDate(day.getUTCDate() - weekday + 1);
    const weekYear = monday.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(weekYear, 0, 1));
    const diffDays = Math.floor((monday.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const week = Math.floor(diffDays / 7) + 1;
    return {
      periodKey: `${weekYear}-W${String(week).padStart(2, '0')}`,
      since: monday,
    };
  }

  private computeRelevanceScore(context: string, content: string, confidence: number): number {
    const contextTokens = new Set(this.extractKeywords(context));
    const contentTokens = new Set(this.extractKeywords(content));
    if (contextTokens.size === 0 || contentTokens.size === 0) {
      return confidence * 0.6;
    }

    let overlap = 0;
    for (const token of contextTokens) {
      if (contentTokens.has(token)) overlap++;
    }

    return overlap * 0.55 + confidence * 0.6;
  }

  private extractKeywords(text: string): string[] {
    return [...new Set(
      (text.match(/[A-Za-z0-9]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? [])
        .map((token) => token.toLowerCase()),
    )];
  }

  private clampConfidence(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0.5;
    return Math.max(0, Math.min(1, Math.round(num * 100) / 100));
  }

  private toRecord(row: {
    id: string;
    scope: string;
    periodKey: string;
    content: string;
    relatedEntityIds: string[];
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
  }): SocialInsightRecord {
    return {
      id: row.id,
      scope: row.scope as SocialInsightScope,
      periodKey: row.periodKey,
      content: row.content,
      relatedEntityIds: row.relatedEntityIds,
      confidence: row.confidence,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
