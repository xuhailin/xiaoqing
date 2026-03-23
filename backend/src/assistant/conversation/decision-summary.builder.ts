import { Injectable } from '@nestjs/common';
import type { DialogueIntentState } from '../intent/intent.types';
import type { ActionDecision } from '../action-reasoner/action-reasoner.types';

export interface DecisionSummaryInput {
  intentState?: DialogueIntentState | null;
  actionDecision?: ActionDecision | null;
}

export interface DecisionSummary {
  /** 简洁的决策摘要（注入到 system prompt） */
  text: string;
}

@Injectable()
export class DecisionSummaryBuilder {
  build(input: DecisionSummaryInput): DecisionSummary {
    const parts: string[] = [];

    const intent = input.intentState;
    const action = input.actionDecision;

    // 1. 意图摘要（纯事实描述，不含语气/风格指导）
    if (intent) {
      if (intent.taskIntent !== 'none' && intent.requiresTool) {
        parts.push(`用户意图：${this.translateTaskIntent(intent.taskIntent)}（置信度 ${intent.confidence.toFixed(2)}）`);
        if (intent.taskIntent === 'device_screenshot') {
          parts.push('这是设备侧执行请求，当前无法直接替用户截屏，需说明限制并引导');
        }
      }
    }

    // 2. 行动决策摘要（纯决策描述，不指导表达方式）
    if (action) {
      if (action.targetKind === 'idea') {
        parts.push('本轮内容更适合收纳为想法记录');
      } else if (action.targetKind === 'todo') {
        parts.push(action.planIntent?.type === 'notify'
          ? '本轮内容已记为待办并安排了提醒'
          : '本轮内容已记为待办');
      }
      switch (action.action) {
        case 'run_capability':
          parts.push(`将执行能力：${action.capability ?? '未指定'}`);
          break;
        case 'handoff_dev':
          parts.push('识别为开发任务，建议引导用户使用开发模式');
          break;
        case 'suggest_reminder':
          parts.push('用户提到将来要做的事，可以建议设置提醒');
          break;
        case 'direct_reply':
          break;
      }
      if (action.reason) {
        parts.push(`决策理由：${action.reason}`);
      }
    }

    const text = parts.length > 0
      ? `[决策上下文]\n${parts.map(p => `- ${p}`).join('\n')}\n请基于此决策上下文生成回复，保持一致性，但不要向用户暴露内部系统机制。`
      : '';

    return { text };
  }

  private translateTaskIntent(taskIntent: string): string {
    const map: Record<string, string> = {
      weather_query: '查询天气',
      book_download: '下载书籍',
      general_tool: '通用工具调用',
      dev_task: '开发任务',
      set_reminder: '设置提醒',
      timesheet: '工时管理',
      device_screenshot: '设备截图请求',
    };
    return map[taskIntent] ?? taskIntent;
  }
}
