import type { ToolPolicyAction } from '../conversation/orchestration.types';
import type { TaskPlan } from '../planning/task-planner.types';

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
  /** 映射后的下游路由 */
  toolPolicyAction?: ToolPolicyAction;
  reason: string;
  confidence: number;
  source: 'rule' | 'llm_hint' | 'reasoning_layer';
  /** suggest_reminder 时的描述 */
  reminderHint?: string;
  /** 任务规划结果（如果生成） */
  taskPlan?: TaskPlan;
}
