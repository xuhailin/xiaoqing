import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Prisma, PlanStatus, ReminderScope, PlanDispatchType } from '@prisma/client';
import { CronJob, validateCronExpression } from 'cron';
import { PrismaService } from '../infra/prisma.service';
import type { CreatePlanInput, UpdatePlanInput, PlanLifecycleAction, Recurrence } from './plan.types';
import { VALID_RECURRENCES } from './plan.types';

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── CRUD ──────────────────────────────────────────────

  async createPlan(input: CreatePlanInput, userId: string = 'default-user') {
    const description = input.description?.trim() || null;
    const title = input.title?.trim() || null;
    if (!title && !description) {
      throw new BadRequestException('title or description is required');
    }

    const recurrence = (input.recurrence ?? 'once') as Recurrence;
    if (!VALID_RECURRENCES.includes(recurrence)) {
      throw new BadRequestException(`invalid recurrence: ${recurrence}`);
    }

    const cronExpr = this.resolveCronExpr(recurrence, input.cronExpr?.trim());
    const runAt = this.parseRunAt(input.runAt);
    this.validateSchedule(recurrence, cronExpr, runAt, input.timezone);

    const scope = input.scope ?? ReminderScope.chat;
    const dispatchType = input.dispatchType ?? PlanDispatchType.notify;
    const sessionId = input.sessionId?.trim() || null;
    const conversationId = input.conversationId?.trim() || null;

    if (dispatchType === PlanDispatchType.notify && !conversationId && !sessionId) {
      throw new BadRequestException(
        'notify dispatch type requires conversationId or sessionId to deliver the reminder',
      );
    }

    const now = new Date();
    const nextRunAt = this.computeNextRunAt({ recurrence, cronExpr, runAt, timezone: input.timezone }, now);

    if (!nextRunAt) {
      throw new BadRequestException('schedule has no future execution time');
    }

    return this.prisma.plan.create({
      data: {
        userId,
        title,
        description,
        scope,
        dispatchType,
        recurrence,
        cronExpr: cronExpr || null,
        runAt: recurrence === 'once' ? runAt : null,
        timezone: input.timezone?.trim() || null,
        status: PlanStatus.active,
        nextRunAt,
        sessionId,
        conversationId,
        sourceTodoId: input.sourceTodoId?.trim() || null,
        actionPayload: (input.actionPayload as Prisma.InputJsonValue) ?? undefined,
        taskTemplates: (input.taskTemplates as unknown as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async getPlan(id: string, userId?: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('plan not found');
    if (userId && plan.userId !== userId) {
      throw new NotFoundException('plan not found');
    }
    return plan;
  }

  async listPlans(
    userId: string,
    filters?: { scope?: ReminderScope; status?: PlanStatus; sessionId?: string; conversationId?: string },
  ) {
    return this.prisma.plan.findMany({
      where: {
        userId,
        scope: filters?.scope,
        status: filters?.status,
        sessionId: filters?.sessionId,
        conversationId: filters?.conversationId,
      },
      orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async updatePlan(id: string, input: UpdatePlanInput, userId?: string) {
    const plan = await this.getPlan(id, userId);

    const recurrence = (input.recurrence ?? plan.recurrence) as Recurrence;
    if (input.recurrence && !VALID_RECURRENCES.includes(recurrence)) {
      throw new BadRequestException(`invalid recurrence: ${recurrence}`);
    }

    const cronExpr = input.cronExpr !== undefined
      ? this.resolveCronExpr(recurrence, input.cronExpr?.trim())
      : plan.cronExpr;
    const runAt = input.runAt !== undefined ? this.parseRunAt(input.runAt) : plan.runAt;
    const timezone = input.timezone !== undefined ? input.timezone?.trim() || null : plan.timezone;

    if (input.recurrence || input.cronExpr !== undefined || input.runAt !== undefined) {
      this.validateSchedule(recurrence, cronExpr ?? undefined, runAt ?? undefined, timezone ?? undefined);
    }

    const now = new Date();
    const nextRunAt = plan.status === PlanStatus.active
      ? this.computeNextRunAt({ recurrence, cronExpr, runAt, timezone }, now)
      : plan.nextRunAt;

    return this.prisma.plan.update({
      where: { id },
      data: {
        title: input.title !== undefined ? input.title?.trim() || null : undefined,
        description: input.description !== undefined ? input.description?.trim() || null : undefined,
        recurrence,
        cronExpr: cronExpr || null,
        runAt: recurrence === 'once' ? runAt : null,
        timezone,
        nextRunAt,
        actionPayload: (input.actionPayload as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async deletePlan(id: string, userId?: string) {
    await this.getPlan(id, userId);
    await this.prisma.plan.delete({ where: { id } });
    return { ok: true };
  }

  // ─── 生命周期 ──────────────────────────────────────────

  async lifecycle(id: string, action: PlanLifecycleAction, userId?: string) {
    const plan = await this.getPlan(id, userId);

    switch (action) {
      case 'pause': {
        if (plan.status !== PlanStatus.active) {
          throw new BadRequestException('only active plans can be paused');
        }
        return this.prisma.plan.update({
          where: { id },
          data: { status: PlanStatus.paused },
        });
      }
      case 'resume': {
        if (plan.status !== PlanStatus.paused) {
          throw new BadRequestException('only paused plans can be resumed');
        }
        const now = new Date();
        const nextRunAt = this.computeNextRunAt({
          recurrence: plan.recurrence as Recurrence,
          cronExpr: plan.cronExpr,
          runAt: plan.runAt,
          timezone: plan.timezone,
        }, now);
        return this.prisma.plan.update({
          where: { id },
          data: { status: PlanStatus.active, nextRunAt },
        });
      }
      case 'archive': {
        return this.prisma.plan.update({
          where: { id },
          data: { status: PlanStatus.archived, nextRunAt: null },
        });
      }
    }
  }

  // ─── 调度辅助（供 PlanSchedulerService 调用） ──────────

  /** 查询所有到期的 active plans */
  async findDuePlans(now: Date, limit = 10) {
    return this.prisma.plan.findMany({
      where: {
        status: PlanStatus.active,
        nextRunAt: { lte: now },
      },
      orderBy: { nextRunAt: 'asc' },
      take: limit,
    });
  }

  /** 触发后更新 Plan 的 nextRunAt / 状态 */
  async advanceAfterTrigger(id: string, now: Date) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) return;

    if (plan.recurrence === 'once') {
      await this.prisma.plan.update({
        where: { id },
        data: {
          status: PlanStatus.archived,
          nextRunAt: null,
          lastTriggeredAt: now,
        },
      });
      return;
    }

    const nextRunAt = this.computeNextRunAt({
      recurrence: plan.recurrence as Recurrence,
      cronExpr: plan.cronExpr,
      runAt: plan.runAt,
      timezone: plan.timezone,
    }, now);

    await this.prisma.plan.update({
      where: { id },
      data: {
        nextRunAt,
        lastTriggeredAt: now,
        // 如果算不出下次时间，自动归档
        ...(nextRunAt ? {} : { status: PlanStatus.archived }),
      },
    });
  }

  /** 记录 Plan 级别的错误 */
  async recordError(id: string, error: string) {
    await this.prisma.plan.update({
      where: { id },
      data: { lastError: error },
    }).catch(() => {});
  }

  // ─── 内部方法 ──────────────────────────────────────────

  /** 把 daily / weekday / weekly 转换为 cronExpr */
  private resolveCronExpr(recurrence: Recurrence, explicitCron?: string): string | undefined {
    if (recurrence === 'cron') {
      return explicitCron;
    }
    if (explicitCron) {
      return explicitCron; // 用户显式提供了 cron，直接用
    }
    // 预设 recurrence 的默认 cron（默认 9:00）
    switch (recurrence) {
      case 'daily':   return '0 9 * * *';
      case 'weekday': return '0 9 * * 1-5';
      case 'weekly':  return '0 9 * * 1';
      default:        return undefined; // once
    }
  }

  private parseRunAt(value?: string | Date): Date | undefined {
    if (!value) return undefined;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('runAt must be a valid date');
    }
    return d;
  }

  private validateSchedule(recurrence: Recurrence, cronExpr?: string, runAt?: Date, timezone?: string) {
    if (recurrence === 'once') {
      if (!runAt) throw new BadRequestException('runAt is required for once recurrence');
      return;
    }
    // 周期性计划需要 cronExpr
    const cron = cronExpr;
    if (!cron) throw new BadRequestException('cronExpr is required for periodic recurrence');

    const result = validateCronExpression(cron);
    if (!result.valid) {
      throw new BadRequestException(`invalid cronExpr: ${result.error}`);
    }
    try {
      new CronJob(cron, () => undefined, null, false, timezone);
    } catch (err) {
      throw new BadRequestException(`invalid cron/timezone: ${String(err)}`);
    }
  }

  computeNextRunAt(
    schedule: { recurrence: Recurrence; cronExpr?: string | null; runAt?: Date | null; timezone?: string | null },
    now: Date,
  ): Date | null {
    if (schedule.recurrence === 'once' && schedule.runAt) {
      return schedule.runAt.getTime() > now.getTime() ? schedule.runAt : null;
    }
    const cron = schedule.cronExpr;
    if (!cron) return null;

    const job = new CronJob(cron, () => undefined, null, false, schedule.timezone ?? undefined);
    const next = job.nextDate();
    return typeof (next as any).toJSDate === 'function'
      ? (next as any).toJSDate()
      : new Date(String(next));
  }
}
