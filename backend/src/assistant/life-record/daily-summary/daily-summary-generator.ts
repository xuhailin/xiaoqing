import { Injectable, Logger } from '@nestjs/common';
import type { OpenAI } from 'openai';
import { LlmService } from '../../../infra/llm/llm.service';
import type { TracePointRecord } from '../trace-point/trace-point.types';
import type { DailySummaryDraft } from './daily-summary.types';

const SUMMARY_PROMPT = `你是小晴的日记助手。给定用户今天的生活碎片列表，写一段简短的日摘要。

要求：
1. 用小晴的第一人称视角写（"今天他/她..."），语气轻松自然
2. 把碎片串成一段连贯的叙述，不要逐条列举
3. 整体 2-4 句话，不要太长
4. title 是一个简短标题（8 字以内）
5. moodOverall 是今天整体的情绪基调（happy/tired/anxious/calm/sad/frustrated/neutral/mixed）
6. 如果碎片之间有因果或时间关系，自然地串联起来
7. 不要虚构碎片中没有提到的事情

返回 JSON：
{
  "title": "简短标题",
  "body": "2-4句话的日摘要",
  "moodOverall": "情绪基调"
}`;

@Injectable()
export class DailySummaryGenerator {
  private readonly logger = new Logger(DailySummaryGenerator.name);

  constructor(private readonly llm: LlmService) {}

  async generate(dayKey: string, points: TracePointRecord[]): Promise<DailySummaryDraft> {
    if (points.length === 0) {
      return { title: '安静的一天', body: '今天没有特别的事情发生。', moodOverall: 'calm' };
    }

    if (points.length <= 2) {
      return this.generateSimple(points);
    }

    return this.generateWithLlm(dayKey, points);
  }

  private generateSimple(points: TracePointRecord[]): DailySummaryDraft {
    const content = points.map((p) => p.content).join('；');
    const mood = points.find((p) => p.mood)?.mood ?? 'neutral';
    return {
      title: '今天的碎片',
      body: `今天记下了这些：${content}。`,
      moodOverall: mood,
    };
  }

  private async generateWithLlm(dayKey: string, points: TracePointRecord[]): Promise<DailySummaryDraft> {
    const pointsText = points
      .map((p, i) => `${i + 1}. [${p.kind}] ${p.content}${p.mood ? ` (${p.mood})` : ''}`)
      .join('\n');

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: '你只输出合法 JSON，不要代码块，不要解释。' },
      {
        role: 'user',
        content: `${SUMMARY_PROMPT}\n\n日期：${dayKey}\n\n生活碎片：\n${pointsText}`,
      },
    ];

    try {
      const raw = await this.llm.generate(messages, { scenario: 'summary' });
      return this.parseLlmOutput(raw);
    } catch (err) {
      this.logger.warn(`LLM summary generation failed: ${String(err)}`);
      return this.generateSimple(points);
    }
  }

  private parseLlmOutput(raw: string): DailySummaryDraft {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('invalid-json');
    }

    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;

    return {
      title: String(parsed.title ?? '今天').trim().slice(0, 20),
      body: String(parsed.body ?? '').trim().slice(0, 500),
      moodOverall: typeof parsed.moodOverall === 'string' ? parsed.moodOverall.trim() || null : null,
    };
  }
}
