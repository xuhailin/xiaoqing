import { Injectable, Logger } from '@nestjs/common';
import type { OpenAI } from 'openai';
import { LlmService } from '../../../infra/llm/llm.service';
import { PrismaService } from '../../../infra/prisma.service';
import { TracePointService } from './trace-point.service';
import type { TracePointDraft, TracePointExtractedBy, TracePointKind, TracePointRecord } from './trace-point.types';

interface ChatMessage {
  id: string;
  role: string;
  kind: string;
  content: string;
  createdAt: Date;
}

const VALID_KINDS: TracePointKind[] = ['event', 'mood', 'mention', 'plan', 'reflection', 'relation_event'];

const EXTRACTION_PROMPT = `你是一个生活碎片提取器。给定一段用户与小晴（AI 助手）的对话，从中提取用户提到的生活碎片。

规则：
1. 只提取用户明确说出的内容，绝不推测或编造
2. 日常寒暄（"你好""谢谢""嗯""好的"）不提取
3. 纯技术问题、代码讨论、开发任务不提取
4. 每段对话最多提取 3 个碎片
5. 如果没有值得记录的内容，返回空数组 []
6. 每条碎片必须描述一件不同的事，禁止把同一件事拆成多个角度（比如"忘记吃饭"不要同时输出 event + mood + reflection）
7. 优先选择最核心的那一个 kind：如果用户说"最近忙到忘记吃饭"，只提取一条 event，mood 字段里标注情绪即可
8. people 字段只填真实的人名，"小晴"是 AI 助手本身，不要放进 people
9. 当用户明确提到与某人的关系变化（吵架、和好、疏远、亲近、一起撑过某事），优先用 relation_event

kind 分类：
- event: 做了某事/发生了某事（"今天面试了""猫生病了"）
- mood: 纯粹的情绪表达，没有具体事件（"好累""今天挺开心"）
- mention: 提到了某人/某物（"我妈说...""新买的键盘到了"）
- plan: 表达了未来打算（"明天要去体检""打算换工作"）
- reflection: 对过去的回顾/感悟（"想想还是我不对"）
- relation_event: 明确描述和某人的关系变化（"跟妈妈吵架了""和小李和好了"）

返回 JSON 数组，每项包含：
- kind: string (必填)
- content: string (必填，一句话描述)
- mood: string | null (happy/tired/anxious/calm/sad/excited/frustrated/neutral)
- people: string[] (提到的真实人名，不包括小晴)
- tags: string[] (1-3个自由标签)
- happenedAt: string | null (仅当用户明确提到不同时间时填 ISO 格式，如"昨天去了医院"则填昨天的日期)`;

@Injectable()
export class TracePointExtractorService {
  private readonly logger = new Logger(TracePointExtractorService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly prisma: PrismaService,
    private readonly tracePointService: TracePointService,
  ) {}

  /**
   * 对一个会话做批量提取。自动跳过已提取过的消息（幂等）。
   */
  async extractFromConversation(
    conversationId: string,
    options?: { since?: Date; until?: Date },
  ): Promise<{ extracted: number; skipped: number }> {
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        role: 'user',
        kind: 'user',
        ...(options?.since || options?.until
          ? {
              createdAt: {
                ...(options.since ? { gte: options.since } : {}),
                ...(options.until ? { lte: options.until } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    let extracted = 0;
    let skipped = 0;

    // 获取对应的 assistant 回复用于上下文
    const allMessages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(options?.since || options?.until
          ? {
              createdAt: {
                ...(options.since ? { gte: options.since } : {}),
                ...(options.until ? { lte: options.until } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    // 按用户消息分组，每条用户消息附带前后上下文
    for (const userMsg of messages) {
      if (this.shouldSkipMessage(userMsg.content)) {
        skipped++;
        continue;
      }

      const alreadyExtracted = await this.tracePointService.hasPointsForMessage(userMsg.id);
      if (alreadyExtracted) {
        skipped++;
        continue;
      }

      // 取该用户消息周围的上下文（前 2 条 + 后 1 条）
      const msgIndex = allMessages.findIndex((m) => m.id === userMsg.id);
      const contextWindow = allMessages.slice(
        Math.max(0, msgIndex - 2),
        Math.min(allMessages.length, msgIndex + 2),
      );

      const drafts = await this.extractFromMessages(contextWindow, userMsg.createdAt);
      if (drafts.length > 0) {
        await this.tracePointService.save(conversationId, userMsg.id, drafts, 'batch');
        extracted += drafts.length;
      }
    }

    this.logger.log(
      `extractFromConversation ${conversationId}: extracted=${extracted}, skipped=${skipped}`,
    );
    return { extracted, skipped };
  }

  /**
   * 对单条用户消息做增量提取。适合接在 post-turn 链路里。
   */
  async extractForMessage(
    conversationId: string,
    sourceMessageId: string,
  ): Promise<TracePointRecord[]> {
    const userMsg = await this.prisma.message.findFirst({
      where: {
        id: sourceMessageId,
        conversationId,
        role: 'user',
        kind: 'user',
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
      },
    });

    if (!userMsg || this.shouldSkipMessage(userMsg.content)) {
      return [];
    }

    const alreadyExtracted = await this.tracePointService.hasPointsForMessage(userMsg.id);
    if (alreadyExtracted) {
      return [];
    }

    const allMessages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        kind: true,
        content: true,
        createdAt: true,
      },
    });

    const msgIndex = allMessages.findIndex((message) => message.id === userMsg.id);
    if (msgIndex < 0) {
      return [];
    }

    const contextWindow = allMessages.slice(
      Math.max(0, msgIndex - 2),
      Math.min(allMessages.length, msgIndex + 2),
    );

    const drafts = await this.extractFromMessages(contextWindow, userMsg.createdAt);
    if (drafts.length === 0) {
      return [];
    }

    return this.tracePointService.save(conversationId, userMsg.id, drafts, 'batch');
  }

  /**
   * 回填最近 N 天的所有会话。
   */
  async backfill(options?: {
    days?: number;
    conversationId?: string;
  }): Promise<{ total: number; extracted: number; conversations: number }> {
    const days = options?.days ?? 3;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    let conversationIds: string[];
    if (options?.conversationId) {
      conversationIds = [options.conversationId];
    } else {
      const conversations = await this.prisma.conversation.findMany({
        where: {
          messages: { some: { createdAt: { gte: since } } },
        },
        select: { id: true },
      });
      conversationIds = conversations.map((c) => c.id);
    }

    let totalExtracted = 0;
    for (const cid of conversationIds) {
      const result = await this.extractFromConversation(cid, { since });
      totalExtracted += result.extracted;
    }

    this.logger.log(
      `backfill: days=${days}, conversations=${conversationIds.length}, extracted=${totalExtracted}`,
    );

    return {
      total: conversationIds.length,
      extracted: totalExtracted,
      conversations: conversationIds.length,
    };
  }

  /**
   * 核心：给定一组消息，调 LLM 提取生活碎片。
   */
  async extractFromMessages(
    messages: ChatMessage[],
    referenceTime: Date,
  ): Promise<TracePointDraft[]> {
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? '用户' : '小晴'}：${m.content}`)
      .join('\n');

    const llmMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: '你只输出合法 JSON 数组，不要代码块，不要解释。如果没有可提取的内容，返回 []' },
      {
        role: 'user',
        content: `${EXTRACTION_PROMPT}\n\n当前时间：${referenceTime.toISOString()}\n\n对话内容：\n${conversationText}`,
      },
    ];

    try {
      const raw = await this.llm.generate(llmMessages, { scenario: 'summary' });
      return this.parseLlmOutput(raw, referenceTime);
    } catch (err) {
      this.logger.warn(`LLM extraction failed: ${String(err)}`);
      return [];
    }
  }

  private parseLlmOutput(raw: string, referenceTime: Date): TracePointDraft[] {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const arrStart = cleaned.indexOf('[');
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrStart < 0 || arrEnd <= arrStart) return [];

    let parsed: unknown[];
    try {
      parsed = JSON.parse(cleaned.slice(arrStart, arrEnd + 1)) as unknown[];
    } catch {
      this.logger.warn('Failed to parse LLM output as JSON array');
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, 3)
      .map((item) => this.validateDraft(item, referenceTime))
      .filter((d): d is TracePointDraft => d !== null);
  }

  private validateDraft(item: unknown, referenceTime: Date): TracePointDraft | null {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;

    const kind = String(obj.kind ?? '').trim();
    if (!VALID_KINDS.includes(kind as TracePointKind)) return null;

    const content = String(obj.content ?? '').trim();
    if (!content || content.length < 2) return null;

    let happenedAt: Date | null = null;
    if (obj.happenedAt && typeof obj.happenedAt === 'string') {
      const parsed = new Date(obj.happenedAt);
      if (!isNaN(parsed.getTime())) happenedAt = parsed;
    }

    return {
      kind: kind as TracePointKind,
      content: content.slice(0, 200),
      happenedAt,
      mood: typeof obj.mood === 'string' ? obj.mood.trim() || null : null,
      people: Array.isArray(obj.people)
        ? obj.people
            .filter((p): p is string => typeof p === 'string')
            .filter((p) => !/小晴|xiaoqing|ai助手/i.test(p))
            .slice(0, 5)
        : [],
      tags: Array.isArray(obj.tags)
        ? obj.tags.filter((t): t is string => typeof t === 'string').slice(0, 5)
        : [],
    };
  }

  private shouldSkipMessage(content: string): boolean {
    const trimmed = content.trim();
    if (trimmed.length < 5) return true;
    if (/^(好的?|嗯|谢谢|ok|thx|thanks|哈哈|嗯嗯|对|是的|没事|行)$/i.test(trimmed)) return true;
    if (trimmed.startsWith('/dev ') || trimmed.startsWith('/task ')) return true;
    return false;
  }
}
