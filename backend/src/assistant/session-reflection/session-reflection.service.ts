import { Injectable, Logger } from '@nestjs/common';
import type { OpenAI } from 'openai';
import { PrismaService } from '../../infra/prisma.service';
import { LlmService } from '../../infra/llm/llm.service';
import type {
  ReflectionResult,
  RelationImpact,
  SessionReflectionQuery,
  SessionReflectionRecord,
} from './session-reflection.types';

const RHYTHM_SIGNAL_GUIDE = [
  'rr.prefer_gentle_direct: 用户更接受温和但直接的回应',
  'rr.prefer_short_reply: 用户偏好简短回复',
  'rr.dislike_too_pushy: 用户不喜欢被追问太紧或推进过猛',
  'rr.prefer_companion_mode_when_tired: 用户疲惫时更偏好陪伴式回应',
  'rr.allow_playful_tease_low: 用户对轻松调侃的接受度较低',
].join('\n');

const REFLECTION_PROMPT = `你是小晴的关系回顾模块。给定一段对话摘要和当前关系状态，分析这次对话对"小晴与用户的关系"意味着什么。

分析维度：
1. 关系影响：这次对话让关系变深了、变浅了、修复了、还是没有明显变化？
2. 节奏观察：用户在这次对话中表现出什么互动节奏偏好？（如偏好简短、不想被追问、需要陪伴等）
3. 共同经历：这次对话是否构成一个有意义的"共同经历"？（如：一起度过焦虑的夜晚、一起庆祝好消息、一起解决难题）
4. 社会关系信号：如果这次对话明显提到"用户和某个人的关系发生变化"，提炼成后续可回流到社会关系图谱的信号

规则：
- 只基于对话内容判断，不要编造
- 如果对话只是简单问答或技术讨论，relationImpact 应为 "neutral"
- trustDelta 和 closenessDelta 范围 -0.1 ~ +0.1，大多数对话应为 0 或很小的正值
- sharedMoment 只在对话有真正的情感深度或共同经历时才为 true
- rhythmNote 只在发现明确的节奏信号时填写，否则为 null
- 只有在你认为发现了可复用的长期节奏偏好时，才填写 newRhythmSignal，否则返回 null
- socialRelationSignals 只在对话里清楚涉及"用户和外部某个人"的关系变化时填写
- socialRelationSignals 不要把"小晴"自己当成 entityName
- socialRelationSignals 最多返回 2 条；证据弱时返回 []

可用的 canonical 节奏 claimKey：
${RHYTHM_SIGNAL_GUIDE}

如果有新的节奏信号：
- claimKey 优先使用上面的 canonical key
- 如果无法可靠映射到 canonical key，可使用 draft.rr.xxx
- level 只能是 low / mid / high
- evidence 用一句话说明观察依据

返回 JSON 对象（不要代码块，不要解释）：
{
  "summary": "一句话描述这次对话的关系意义",
  "relationImpact": "deepened" | "neutral" | "strained" | "repaired",
  "rhythmNote": "节奏观察" | null,
  "sharedMoment": boolean,
  "momentHint": "如果 sharedMoment=true，简述这个共同经历" | null,
  "trustDelta": number,
  "closenessDelta": number,
  "socialRelationSignals": [
    {
      "entityName": "妈妈",
      "impact": "strained" | "repaired" | "deepened",
      "evidence": "用户提到最近和妈妈有些冷战，还不知道怎么开口"
    }
  ],
  "newRhythmSignal": {
    "claimKey": "rr.prefer_short_reply",
    "level": "mid",
    "evidence": "用户明确要求简短一点，并快速结束延展追问"
  } | null
}`;

@Injectable()
export class SessionReflectionService {
  private readonly logger = new Logger(SessionReflectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * 对一次对话做关系回顾。由 PostTurnPipeline 在满足条件时调用。
   */
  async reflect(input: {
    conversationId: string;
    recentMessages: Array<{ role: string; content: string }>;
    relationshipContext?: {
      stage: string;
      trustScore: number;
      closenessScore: number;
    };
  }): Promise<SessionReflectionRecord | null> {
    // 跳过对话太短的情况
    const userMsgCount = input.recentMessages.filter((m) => m.role === 'user').length;
    if (userMsgCount < 2) return null;

    // 避免重复：同一个 conversation 最近 1 小时内不重复反思
    const recent = await this.prisma.sessionReflection.findFirst({
      where: {
        conversationId: input.conversationId,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recent) return this.toRecord(recent);

    const result = await this.callLlm(input);
    if (!result) return null;

    const row = await this.prisma.sessionReflection.create({
      data: {
        conversationId: input.conversationId,
        summary: result.summary,
        relationImpact: result.relationImpact,
        rhythmNote: result.rhythmNote,
        sharedMoment: result.sharedMoment,
        momentHint: result.momentHint,
        trustDelta: result.trustDelta,
        closenessDelta: result.closenessDelta,
      },
    });

    this.logger.log(
      `Session reflection for ${input.conversationId}: impact=${result.relationImpact}, shared=${result.sharedMoment}`,
    );

    return {
      ...this.toRecord(row),
      ...(result.socialRelationSignals ? { socialRelationSignals: result.socialRelationSignals } : {}),
      ...(result.newRhythmSignal ? { newRhythmSignal: result.newRhythmSignal } : {}),
    };
  }

  async list(query?: SessionReflectionQuery): Promise<SessionReflectionRecord[]> {
    const where: Record<string, unknown> = {};
    if (query?.conversationId) {
      where.conversationId = query.conversationId;
    } else if (query?.conversationIds?.length) {
      where.conversationId = { in: query.conversationIds };
    }
    if (query?.relationImpact) where.relationImpact = query.relationImpact;
    if (query?.sharedMomentOnly) where.sharedMoment = true;
    if (query?.since) where.createdAt = { gte: query.since };

    const rows = await this.prisma.sessionReflection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query?.limit ?? 50,
    });

    return rows.map(this.toRecord);
  }

  async getSharedMomentCandidates(since?: Date): Promise<SessionReflectionRecord[]> {
    return this.list({ sharedMomentOnly: true, since });
  }

  // ── Private ──────────────────────────────────────────────

  private async callLlm(input: {
    recentMessages: Array<{ role: string; content: string }>;
    relationshipContext?: { stage: string; trustScore: number; closenessScore: number };
  }): Promise<ReflectionResult | null> {
    const conversationText = input.recentMessages
      .slice(-20) // 最多取最近 20 条
      .map((m) => `${m.role === 'user' ? '用户' : '小晴'}：${m.content}`)
      .join('\n');

    const contextInfo = input.relationshipContext
      ? `\n当前关系状态：阶段=${input.relationshipContext.stage}，信任度=${input.relationshipContext.trustScore.toFixed(2)}，亲密度=${input.relationshipContext.closenessScore.toFixed(2)}`
      : '';

    const llmMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: '你只输出合法 JSON 对象，不要代码块，不要解释。',
      },
      {
        role: 'user',
        content: `${REFLECTION_PROMPT}${contextInfo}\n\n对话内容：\n${conversationText}`,
      },
    ];

    try {
      const raw = await this.llm.generate(llmMessages, { scenario: 'summary' });
      return this.parseResult(raw);
    } catch (err) {
      this.logger.warn(`LLM reflection failed: ${String(err)}`);
      return null;
    }
  }

  private parseResult(raw: string): ReflectionResult | null {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart < 0 || objEnd <= objStart) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>;
    } catch {
      this.logger.warn('Failed to parse reflection JSON');
      return null;
    }

    const validImpacts: RelationImpact[] = ['deepened', 'neutral', 'strained', 'repaired'];
    const impact = String(parsed.relationImpact ?? 'neutral');
    const socialRelationSignals = this.parseSocialRelationSignals(parsed.socialRelationSignals);
    const signal = this.parseRhythmSignal(parsed.newRhythmSignal);

    return {
      summary: String(parsed.summary ?? '').slice(0, 500) || '对话关系回顾',
      relationImpact: validImpacts.includes(impact as RelationImpact)
        ? (impact as RelationImpact)
        : 'neutral',
      rhythmNote: typeof parsed.rhythmNote === 'string' ? parsed.rhythmNote.slice(0, 300) : null,
      sharedMoment: parsed.sharedMoment === true,
      momentHint: typeof parsed.momentHint === 'string' ? parsed.momentHint.slice(0, 300) : null,
      trustDelta: this.clampDelta(parsed.trustDelta),
      closenessDelta: this.clampDelta(parsed.closenessDelta),
      ...(socialRelationSignals.length > 0 ? { socialRelationSignals } : {}),
      ...(signal ? { newRhythmSignal: signal } : {}),
    };
  }

  private parseSocialRelationSignals(value: unknown): NonNullable<ReflectionResult['socialRelationSignals']> {
    if (!Array.isArray(value)) return [];

    const results: NonNullable<ReflectionResult['socialRelationSignals']> = [];
    const seen = new Set<string>();

    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const entityName = String(obj.entityName ?? '').trim();
      const evidence = String(obj.evidence ?? '').trim();
      const impact = String(obj.impact ?? '').trim();

      if (!entityName || !evidence) continue;
      if (entityName === '小晴' || entityName.toLowerCase() === 'xiaoqing') continue;
      if (impact !== 'strained' && impact !== 'repaired' && impact !== 'deepened') continue;

      const key = entityName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        entityName: entityName.slice(0, 40),
        impact,
        evidence: evidence.slice(0, 200),
      });

      if (results.length >= 2) break;
    }

    return results;
  }

  private parseRhythmSignal(value: unknown): ReflectionResult['newRhythmSignal'] | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const obj = value as Record<string, unknown>;
    const claimKey = String(obj.claimKey ?? '').trim();
    const evidence = String(obj.evidence ?? '').trim();
    const level = String(obj.level ?? '').trim();

    if (!claimKey || !evidence) return undefined;
    if (level !== 'low' && level !== 'mid' && level !== 'high') return undefined;

    return {
      claimKey: claimKey.slice(0, 40),
      level,
      evidence: evidence.slice(0, 200),
    };
  }

  private clampDelta(value: unknown): number {
    const num = Number(value);
    if (isNaN(num)) return 0;
    return Math.max(-0.1, Math.min(0.1, Math.round(num * 100) / 100));
  }

  private toRecord(row: {
    id: string;
    conversationId: string;
    summary: string;
    relationImpact: string;
    rhythmNote: string | null;
    sharedMoment: boolean;
    momentHint: string | null;
    trustDelta: number;
    closenessDelta: number;
    createdAt: Date;
  }): SessionReflectionRecord {
    return {
      id: row.id,
      conversationId: row.conversationId,
      summary: row.summary,
      relationImpact: row.relationImpact as RelationImpact,
      rhythmNote: row.rhythmNote,
      sharedMoment: row.sharedMoment,
      momentHint: row.momentHint,
      trustDelta: row.trustDelta,
      closenessDelta: row.closenessDelta,
      createdAt: row.createdAt,
    };
  }
}
