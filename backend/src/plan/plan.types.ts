import type { PlanStatus, PlanDispatchType, ReminderScope, TaskMode } from '@prisma/client';

/**
 * Task 模板：描述 Plan 触发时要执行的一个原子动作。
 * Plan.taskTemplates 为 TaskTemplate[] 时，触发会生成多个 Task。
 */
export interface TaskTemplate {
  /** 要调用的 capability 名称，如 'weather', 'checkin', 'reminder' */
  action: string;
  /** 传给 CapabilityRegistry.execute() 的参数 */
  params?: Record<string, unknown>;
  /** execute=调用能力 | notify=仅通知。默认 execute */
  mode?: TaskMode;
}

/** 创建 Plan 的输入 */
export interface CreatePlanInput {
  title?: string;
  description?: string;
  scope?: ReminderScope;
  dispatchType?: PlanDispatchType;

  /** once | daily | weekday | weekly | cron */
  recurrence?: string;
  cronExpr?: string;
  runAt?: string | Date;
  timezone?: string;

  sessionId?: string;
  conversationId?: string;
  sourceTodoId?: string;

  /** dispatchType=action 时的能力调用参数（单 Task 场景） */
  actionPayload?: Record<string, unknown>;
  /** 多 Task 模板（多 Task 场景，优先级高于 actionPayload） */
  taskTemplates?: TaskTemplate[];
}

/** 更新 Plan 的输入（部分字段可选） */
export interface UpdatePlanInput {
  title?: string;
  description?: string;
  recurrence?: string;
  cronExpr?: string;
  runAt?: string | Date;
  timezone?: string;
  actionPayload?: Record<string, unknown>;
}

/** Plan 生命周期操作 */
export type PlanLifecycleAction = 'pause' | 'resume' | 'archive';

/** skip / reschedule 单次 occurrence 的输入 */
export interface OccurrenceExceptionInput {
  planId: string;
  /** 目标 occurrence 的原定时间（用于定位） */
  scheduledAt: Date;
  action: 'skip' | 'reschedule';
  /** action=reschedule 时必填 */
  rescheduledTo?: Date;
  reason?: string;
}

/** 调度分发结果 */
export interface DispatchResult {
  occurrenceId: string;
  planId: string;
  resultRef?: string;
  resultPayload?: Record<string, unknown>;
}

/** 支持的 recurrence 值 */
export const VALID_RECURRENCES = ['once', 'daily', 'weekday', 'weekly', 'cron'] as const;
export type Recurrence = (typeof VALID_RECURRENCES)[number];
