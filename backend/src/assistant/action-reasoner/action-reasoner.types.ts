import type { ToolPolicyDecision } from '../conversation/orchestration.types';
import type { TaskPlan } from '../planning/task-planner.types';
import type { DialogueTargetKind, PlanIntentFromIntent, TaskIntentItem } from '../intent/intent.types';

/** 行动决策模式 */
export type ActionMode =
  | 'direct_reply'       // 纯聊天回复
  | 'run_capability'     // 调用本地能力或 OpenClaw
  | 'handoff_dev'        // 建议移交开发代理
  | 'suggest_reminder';  // 建议设置提醒（不自动创建）

export interface ActionDecision {
  action: ActionMode;
  /** run_capability 时指定能力名 */
  capability?: string;
  /** 本回合统一执行路由，供 Orchestrator / Engine 直接消费 */
  toolPolicy: ToolPolicyDecision;
  reason: string;
  confidence: number;
  source: 'rule' | 'llm_hint' | 'reasoning_layer';
  /** 用户内容应落到哪一类对象，由 LLM 决策输出 */
  targetKind?: DialogueTargetKind;
  /** 是否需要补 Plan 调度层 */
  planIntent?: PlanIntentFromIntent;
  /** suggest_reminder 时的描述 */
  reminderHint?: string;
  /** 任务规划结果（如果生成） */
  taskPlan?: TaskPlan;
  /** 多意图场景：除主动作外需延迟执行的意图（由 Orchestrator 创建 Plan） */
  deferredIntents?: TaskIntentItem[];
}
