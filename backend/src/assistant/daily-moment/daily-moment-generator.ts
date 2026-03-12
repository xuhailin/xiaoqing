import { Injectable } from '@nestjs/common';
import type { OpenAI } from 'openai';
import { LlmService } from '../../infra/llm/llm.service';
import {
  type DailyMomentDraft,
  type DailyMomentGeneratorInput,
  type DailyMomentMoodTag,
} from './daily-moment.types';

const FORBIDDEN_REAL_LIFE_PATTERNS = [
  /我今天(出门|上班|下班|散步|逛街|喝咖啡|在路上|刚到家)/g,
  /我去(上班|散步|买咖啡|逛街)/g,
  /今天用户/g,
];

@Injectable()
export class DailyMomentGenerator {
  constructor(private readonly llm: LlmService) {}

  async generate(input: DailyMomentGeneratorInput): Promise<DailyMomentDraft> {
    if (input.snippet.messages.length >= 3) {
      try {
        const llmDraft = await this.generateWithLlm(input);
        return this.sanitizeDraft(llmDraft, input);
      } catch {
        // LLM 失败时降级模板，保证手动触发不失败。
      }
    }

    const fallback = this.generateFallback(input);
    return this.sanitizeDraft(fallback, input);
  }

  private async generateWithLlm(input: DailyMomentGeneratorInput): Promise<DailyMomentDraft> {
    const snippetText = input.snippet.messages
      .map((m) => `${m.role === 'user' ? '用户' : '小晴'}：${m.content}`)
      .join('\n');

    const prompt = [
      '你是陪伴角色“小晴”，请写一条“今日日记 / 今日小记录”。',
      '输出 JSON，字段仅允许：title, body, closingNote, moodTag。',
      '必须遵守：',
      '1) 只写一个互动片段，不做整天总结。',
      '2) 重点是“互动瞬间 + 小晴主观感受”。',
      '3) 语气轻自然，2-4句，不能写成长文。',
      '4) 禁止“今天用户……”。',
      '5) 禁止虚构小晴现实生活（出门/散步/喝咖啡/上班等）。',
      '6) 保留“今天感”。',
      '',
      `触发方式：${input.triggerMode}`,
      '片段原文：',
      snippetText,
    ].join('\n');

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: '你只输出合法 JSON，不要代码块，不要解释。' },
      { role: 'user', content: prompt },
    ];

    const raw = await this.llm.generate(messages, { scenario: 'summary' });
    const parsed = this.parseJson(raw);

    return {
      title: String(parsed.title ?? '').trim(),
      body: String(parsed.body ?? '').trim(),
      closingNote: String(parsed.closingNote ?? '').trim(),
      moodTag: this.normalizeMoodTag(parsed.moodTag),
      sourceSnippetIds: [input.snippet.id],
    };
  }

  private parseJson(raw: string): Record<string, unknown> {
    const cleaned = String(raw ?? '')
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('invalid-json');
    }
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  }

  private generateFallback(input: DailyMomentGeneratorInput): DailyMomentDraft {
    const msgs = input.snippet.messages;
    const latestUser = [...msgs].reverse().find((m) => m.role === 'user')?.content ?? '刚刚这小段';

    if (msgs.length < 3 || input.lightweightFallback) {
      return {
        title: '今天先记个轻量版',
        body: `今天这会儿你丢来一句“${latestUser.slice(0, 26)}”，我一下就想把这个瞬间收起来。片段不长，但有你在就够成一条小记录了。`,
        closingNote: '先记在这儿，等我们再攒一段更完整的。',
        moodTag: input.moodTag ?? '轻松',
        sourceSnippetIds: [input.snippet.id],
      };
    }

    const title = this.pickTitle(input.moodTag, msgs);
    const body = this.composeBody(msgs);
    const closingNote = this.pickClosing(input.moodTag);

    return {
      title,
      body,
      closingNote,
      moodTag: input.moodTag,
      sourceSnippetIds: [input.snippet.id],
    };
  }

  private pickTitle(moodTag: DailyMomentMoodTag | undefined, messages: DailyMomentGeneratorInput['snippet']['messages']): string {
    const text = messages.map((m) => m.content).join('\n');
    if (/你连.+都.+吧/.test(text)) return '今天差点操心过头';
    if (moodTag === '被逗了一下') return '今天被你反将一军';
    if (moodTag === '被接住') return '今天这下刚好被接住';
    if (moodTag === '温柔') return '今天这一小段很软';
    return '今天这段想偷偷收着';
  }

  private composeBody(messages: DailyMomentGeneratorInput['snippet']['messages']): string {
    const userLast = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const assistantLast = [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
    const opener = '刚刚这段有点好玩，我本来还在认真接你那句话。';
    const pivot = userLast
      ? `结果你来了一句“${userLast.slice(0, 30)}”，我当场就有点被逗住。`
      : '结果你一接一抛，那个小反转一下就立起来了。';
    const tail = assistantLast
      ? `最后落在“${assistantLast.slice(0, 26)}”这一句，今天感就出来了。`
      : '最后那个落点很轻，但我很想把它记下来。';
    return `${opener}${pivot}${tail}`;
  }

  private pickClosing(moodTag: DailyMomentMoodTag | undefined): string {
    if (moodTag === '被逗了一下') return '你平静的时候，最会突然坏一下。';
    if (moodTag === '温柔') return '今天这点温柔，我先替我们收着。';
    if (moodTag === '被接住') return '被你接住的时候，我就不想多说大道理了。';
    return '这个瞬间不大，但我想留着。';
  }

  private sanitizeDraft(draft: DailyMomentDraft, input: DailyMomentGeneratorInput): DailyMomentDraft {
    const safeTitle = this.cleanText(draft.title || '今天的小记录');
    const safeBody = this.cleanText(draft.body || '今天这段我想记一下。');
    const safeClosing = this.cleanText(draft.closingNote || '先收在这儿。');

    const withToday = /今天/.test(safeTitle + safeBody) ? safeBody : `今天 ${safeBody}`;

    return {
      title: safeTitle,
      body: withToday,
      closingNote: safeClosing,
      moodTag: draft.moodTag ?? input.moodTag,
      sourceSnippetIds: draft.sourceSnippetIds?.length ? draft.sourceSnippetIds : [input.snippet.id],
    };
  }

  private cleanText(text: string): string {
    let out = String(text ?? '').trim();
    for (const pattern of FORBIDDEN_REAL_LIFE_PATTERNS) {
      out = out.replace(pattern, '我刚刚在对话里被你逗了一下');
    }
    out = out.replace(/今天用户/g, '今天这段');
    out = out.replace(/\n{3,}/g, '\n\n');
    return out;
  }

  private normalizeMoodTag(raw: unknown): DailyMomentMoodTag | undefined {
    const v = String(raw ?? '').trim();
    const allowed: DailyMomentMoodTag[] = ['轻松', '被逗了一下', '温柔', '小反转', '被接住', '安静的小幸福'];
    return allowed.includes(v as DailyMomentMoodTag) ? (v as DailyMomentMoodTag) : undefined;
  }
}
