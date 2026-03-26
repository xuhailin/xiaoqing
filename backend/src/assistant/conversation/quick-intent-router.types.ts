import type { DialogueTaskIntent } from '../intent/intent.types';

/**
 * Quick Intent Router 输出。
 *
 * path:
 *   'tool'  — 高置信度工具指令，走轻量感知 + 工具执行路径
 *   'chat'  — 低置信度或纯对话，走完整五层主链路
 *
 * toolHint 使用现有 DialogueTaskIntent 枚举值，供下游 ActionReasoner 直接消费。
 */
export type QuickRouterPath = 'chat' | 'tool';

export interface QuickRouterOutput {
  path: QuickRouterPath;
  confidence: number; // 0-1
  toolHint?: DialogueTaskIntent;
  source: 'rule' | 'llm' | 'fallback';
}
