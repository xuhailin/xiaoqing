import { Injectable } from '@nestjs/common';
import type { DialogueIntentState } from '../assistant/intent/intent.types';

@Injectable()
export class TaskFormatterService {
  /** 最近几轮消息用作上下文（每轮 2 条 user+assistant） */
  private readonly contextMessageCap = 6;

  /**
   * 将用户原始输入 + 上下文格式化为 OpenClaw 能理解的任务描述。
   * 首行优先写出「执行任务 + 关键参数」，避免下游只解析最后一句而丢失意图。
   * 保持简洁，不注入小晴人格——OpenClaw 只需要知道"做什么"。
   */
  formatTask(
    userInput: string,
    intent: DialogueIntentState,
    recentContext?: Array<{ role: string; content: string }>,
  ): string {
    const parts: string[] = [];
    const hasContext = Array.isArray(recentContext) && recentContext.length > 0;
    const contextSlice = hasContext ? recentContext.slice(-this.contextMessageCap) : [];

    // 1）首行：明确任务与参数（便于只解析首行的下游也能拿到完整意图）
    const taskLine = this.buildExplicitTaskLine(userInput, intent, contextSlice.length >= 2);
    if (taskLine) parts.push(taskLine);

    // 2）对话上下文（帮助 OpenClaw 理解指代与补全参数的含义）
    if (contextSlice.length > 0) {
      const contextLines = contextSlice
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      parts.push(`对话上下文：\n${contextLines}`);
      // 多轮时强调：当前用户回复是在补全参数，请结合上文执行
      if (contextSlice.length >= 2) {
        parts.push('说明：上文中小晴已追问过缺失信息，用户当前回复为补全内容（如城市名）。请结合上下文理解完整任务并执行，返回纯文本结果即可。');
      }
    }

    parts.push(`用户当前请求：${userInput}`);
    parts.push('请直接执行并返回结果，不需要确认。返回纯文本结果即可。');

    return parts.join('\n\n');
  }

  /**
   * 根据意图生成首行「执行任务：…；参数：…」，避免仅传「北京」时下游不知道是查天气。
   */
  private buildExplicitTaskLine(
    userInput: string,
    intent: DialogueIntentState,
    isFollowUp: boolean,
  ): string {
    if (intent.taskIntent === 'weather_query') {
      const place = (typeof intent.slots.city === 'string' && intent.slots.city.trim())
        ? intent.slots.city + (typeof intent.slots.district === 'string' && intent.slots.district.trim() ? intent.slots.district : '')
        : (typeof intent.slots.location === 'string' && intent.slots.location.trim() ? intent.slots.location : userInput);
      const dateLabel = typeof intent.slots.dateLabel === 'string' ? intent.slots.dateLabel : '';
      const datePart = dateLabel ? `时间：${dateLabel}。` : '';
      return `执行任务：查天气。${isFollowUp ? '用户已补全参数。' : ''}地点：${place}。${datePart}`;
    }
    if (isFollowUp && userInput.trim()) {
      return `执行任务：结合上文对话理解。用户刚回复（补全信息）：${userInput}。`;
    }
    return `执行任务：${userInput.trim() || '见下方对话上下文'}`;
  }
}
