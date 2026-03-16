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
  /** 表达提示：影响语气和回复风格 */
  expressionHints: ExpressionHints;
}

export interface ExpressionHints {
  /** 建议语气 */
  tone?: 'casual' | 'focused' | 'supportive' | 'professional';
  /** 回复重点 */
  emphasis?: string;
  /** 附加上下文 */
  context?: string;
}

@Injectable()
export class DecisionSummaryBuilder {
  build(input: DecisionSummaryInput): DecisionSummary {
    const parts: string[] = [];
    let tone: ExpressionHints['tone'];
    let emphasis: string | undefined;
    let context: string | undefined;

    const intent = input.intentState;
    const action = input.actionDecision;

    // 1. 意图摘要
    if (intent) {
      if (intent.taskIntent !== 'none' && intent.requiresTool) {
        parts.push(`用户意图：${this.translateTaskIntent(intent.taskIntent)}（置信度 ${intent.confidence.toFixed(2)}）`);
        tone = 'focused';
      } else if (intent.mode === 'thinking') {
        parts.push('用户在思考或讨论，不需要执行工具');
        tone = 'supportive';
      } else if (intent.seriousness === 'focused') {
        parts.push('用户语气专注认真，需要认真对待');
        tone = 'professional';
      } else {
        tone = 'casual';
      }
    }

    // 2. 行动决策摘要
    if (action) {
      switch (action.action) {
        case 'run_capability':
          parts.push(`将执行能力：${action.capability ?? '未指定'}`);
          emphasis = `围绕 ${action.capability ?? '能力执行'} 的结果组织回复`;
          break;
        case 'handoff_dev':
          parts.push('识别为开发任务，建议引导用户使用开发模式');
          emphasis = '自然地建议使用 /dev 前缀';
          break;
        case 'suggest_reminder':
          parts.push('用户提到将来要做的事，可以建议设置提醒');
          emphasis = '自然地询问是否需要设置提醒';
          break;
        case 'direct_reply':
          // 直接回复不需要额外提示
          break;
      }
      if (action.reason) {
        parts.push(`决策理由：${action.reason}`);
      }
    }

    const text = parts.length > 0
      ? `[决策上下文]\n${parts.map(p => `- ${p}`).join('\n')}\n请基于此决策上下文生成回复，保持一致性，但不要向用户暴露内部系统机制。`
      : '';

    return {
      text,
      expressionHints: {
        tone,
        emphasis,
        context,
      },
    };
  }

  private translateTaskIntent(taskIntent: string): string {
    const map: Record<string, string> = {
      weather_query: '查询天气',
      book_download: '下载书籍',
      general_tool: '通用工具调用',
      dev_task: '开发任务',
      set_reminder: '设置提醒',
      timesheet: '工时管理',
    };
    return map[taskIntent] ?? taskIntent;
  }
}
