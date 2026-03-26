import type { ToolPolicyDecision } from '../conversation/orchestration.types';
import type { TaskPlan } from '../planning/task-planner.types';
import type { DialogueTargetKind, PlanIntentFromIntent, TaskIntentItem } from '../intent/intent.types';

/** 行动决策模式 */
export type ActionMode =
  | 'direct_reply'       // 纯聊天回复
  | 'run_capability'     // 调用本地能力或 OpenClaw
  | 'handoff_dev'        // 建议移交开发代理
  | 'suggest_reminder';  // 建议设置提醒（不自动创建）

export interface ActionFallbackPolicy {
  condition: 'skill_fail';
  fallback: 'openclaw' | 'chat';
  reason?: string;
}

export interface ActionWorkItemPolicy {
  shouldCapture: boolean;
  kind: 'idea' | 'todo' | 'none';
  createPlan?: boolean;
}

/**
 * 决策层对本回合主动作的唯一结构化输出。
 *
 * 由 ActionReasonerService.decideFromPerception 基于 PerceptionState 产出，
 * 供 Orchestrator、执行层与后处理层统一消费，而不是重复做行为判断。
 */
export interface ActionDecision {
  /** 本回合最终选择的动作模式。 */
  action: ActionMode;
  /** run_capability 时指定能力名。 */
  capability?: string;
  /** 本回合统一执行路由，供 Orchestrator / Engine 直接消费。 */
  toolPolicy: ToolPolicyDecision;
  /** 决策原因，供 trace / debug / post-turn 使用。 */
  reason: string;
  /** 当前决策置信度，通常沿用意图层置信度。 */
  confidence: number;
  /** 决策来源，区分规则、LLM hint 与推理层。 */
  source: 'rule' | 'llm_hint' | 'reasoning_layer';
  /** 用户内容应落到哪一类对象，由 LLM 决策输出。 */
  targetKind?: DialogueTargetKind;
  /** 是否需要补 Plan 调度层。 */
  planIntent?: PlanIntentFromIntent;
  /** 本地执行失败时的统一降级策略。 */
  fallbackPolicy?: ActionFallbackPolicy;
  /** 结构化产出策略，由 Orchestrator 直接执行。 */
  workItemPolicy?: ActionWorkItemPolicy;
  /** suggest_reminder 时面向用户的自然提示。 */
  reminderHint?: string;
  /** 任务规划结果（如果生成）。 */
  taskPlan?: TaskPlan;
  /** 多意图场景：除主动作外需延迟执行的意图（由 Orchestrator 创建 Plan）。 */
  deferredIntents?: TaskIntentItem[];
}

/** DecisionState 是 ActionDecision 在主链路中的语义别名，表示决策层的最终结构化输出。 */
export type DecisionState = ActionDecision;
