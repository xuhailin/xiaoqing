import type { PlanStatus, PlanDispatchType, ReminderScope } from '@prisma/client';

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

  /** dispatchType=action 时的能力调用参数 */
  actionPayload?: Record<string, unknown>;
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
}

/** 支持的 recurrence 值 */
export const VALID_RECURRENCES = ['once', 'daily', 'weekday', 'weekly', 'cron'] as const;
export type Recurrence = (typeof VALID_RECURRENCES)[number];
