import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Prisma, DevRunStatus, ReminderScope } from '@prisma/client';
import { CronJob, validateCronExpression } from 'cron';
import { PrismaService } from '../infra/prisma.service';
import { DevRunRunnerService } from './dev-runner.service';
import { DevSessionRepository } from './dev-session.repository';

export interface CreateDevReminderInput {
  sessionId?: string;
  conversationId?: string;
  scope?: 'dev' | 'system' | 'chat';
  title?: string;
  message: string;
  cronExpr?: string;
  runAt?: string | Date;
  timezone?: string;
  enabled?: boolean;
}

@Injectable()
export class DevReminderService {
  private readonly logger = new Logger(DevReminderService.name);
  private pollInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: DevSessionRepository,
    private readonly runner: DevRunRunnerService,
  ) {}

  async createReminder(input: CreateDevReminderInput) {
    const message = input.message?.trim();
    if (!message) {
      throw new BadRequestException('message is required');
    }

    const cronExpr = input.cronExpr?.trim();
    const runAt = this.parseRunAt(input.runAt);
    this.assertScheduleInput(cronExpr, runAt, input.timezone);

    const scope = (input.scope as ReminderScope) ?? ReminderScope.dev;
    const enabled = input.enabled !== false;
    const now = new Date();
    const nextRunAt = enabled
      ? this.computeNextRunAt({ cronExpr, runAt, timezone: input.timezone }, now)
      : null;

    if (enabled && !nextRunAt) {
      throw new BadRequestException('runAt must be in the future');
    }

    // dev scope 必须有 session；其他 scope 可选
    let sessionId: string | null = null;
    if (scope === ReminderScope.dev) {
      const session = await this.resolveSession(input.sessionId, input.conversationId);
      sessionId = session.id;
    } else if (input.sessionId) {
      // 非 dev scope 也可以关联 session（可选）
      const existing = await this.sessions.getSession(input.sessionId);
      if (!existing) {
        throw new NotFoundException('session not found');
      }
      sessionId = existing.id;
    }

    return this.prisma.devReminder.create({
      data: {
        sessionId,
        scope,
        title: input.title?.trim() || null,
        message,
        cronExpr: cronExpr || null,
        runAt,
        timezone: input.timezone?.trim() || null,
        enabled,
        nextRunAt,
      },
      include: {
        session: {
          select: { id: true, conversationId: true, status: true },
        },
      },
    });
  }

  async listReminders(sessionId?: string) {
    return this.prisma.devReminder.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        session: {
          select: { id: true, conversationId: true, status: true },
        },
      },
    });
  }

  async setReminderEnabled(id: string, enabled: boolean) {
    const reminder = await this.prisma.devReminder.findUnique({ where: { id } });
    if (!reminder) {
      throw new NotFoundException('reminder not found');
    }

    const nextRunAt = enabled
      ? this.computeNextRunAt(
          {
            cronExpr: reminder.cronExpr ?? undefined,
            runAt: reminder.runAt ?? undefined,
            timezone: reminder.timezone ?? undefined,
          },
          new Date(),
        )
      : null;

    if (enabled && !nextRunAt) {
      throw new BadRequestException('reminder has no future schedule');
    }

    return this.prisma.devReminder.update({
      where: { id },
      data: {
        enabled,
        nextRunAt,
        lastError: null,
      },
      include: {
        session: {
          select: { id: true, conversationId: true, status: true },
        },
      },
    });
  }

  async triggerReminderNow(id: string) {
    const reminder = await this.prisma.devReminder.findUnique({
      where: { id },
    });
    if (!reminder) {
      throw new NotFoundException('reminder not found');
    }

    const dispatchResult = await this.dispatchSingleReminder(reminder.id, new Date(), true);
    if (!dispatchResult) {
      throw new BadRequestException('failed to trigger reminder');
    }

    return {
      reminderId: reminder.id,
      runId: dispatchResult.runId,
      sessionId: dispatchResult.sessionId,
    };
  }

  async deleteReminder(id: string) {
    const existing = await this.prisma.devReminder.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('reminder not found');
    }
    await this.prisma.devReminder.delete({ where: { id } });
    return { ok: true };
  }

  async dispatchDueReminders(limit = 10) {
    if (this.pollInProgress) {
      return { scanned: 0, triggered: 0, skipped: true };
    }

    this.pollInProgress = true;
    try {
      const now = new Date();
      const dueReminders = await this.prisma.devReminder.findMany({
        where: {
          enabled: true,
          nextRunAt: { lte: now },
        },
        orderBy: { nextRunAt: 'asc' },
        take: limit,
        select: { id: true },
      });

      let triggered = 0;
      for (const reminder of dueReminders) {
        const result = await this.dispatchSingleReminder(reminder.id, now);
        if (result) {
          triggered += 1;
        }
      }

      return {
        scanned: dueReminders.length,
        triggered,
        skipped: false,
      };
    } finally {
      this.pollInProgress = false;
    }
  }

  private async dispatchSingleReminder(
    reminderId: string,
    now: Date,
    forced = false,
  ): Promise<{ runId: string; sessionId: string | null } | null> {
    const txResult = await this.prisma.$transaction(async (tx) => {
      const reminder = await tx.devReminder.findUnique({
        where: { id: reminderId },
      });
      if (!reminder) {
        return null;
      }

      if (!forced) {
        if (!reminder.enabled) return null;
        if (!reminder.nextRunAt || reminder.nextRunAt.getTime() > now.getTime()) return null;
      }

      const scheduleNext = this.computeNextAfterTrigger(reminder, now);

      // dev scope: 创建 DevRun 并入队执行
      if (reminder.scope === ReminderScope.dev) {
        if (!reminder.sessionId) {
          this.logger.warn(`Dev-scope reminder ${reminderId} has no sessionId, skipping`);
          return null;
        }
        const run = await tx.devRun.create({
          data: {
            sessionId: reminder.sessionId,
            userInput: reminder.message,
            status: DevRunStatus.queued,
            result: this.buildReminderQueuedResult(reminder.id, reminder.message, forced),
          },
          select: { id: true, sessionId: true },
        });

        await tx.devReminder.update({
          where: { id: reminder.id },
          data: {
            enabled: scheduleNext.enabled,
            nextRunAt: scheduleNext.nextRunAt,
            lastTriggeredAt: now,
            lastRunId: run.id,
            lastError: null,
          },
        });

        return { runId: run.id, sessionId: run.sessionId, scope: reminder.scope };
      }

      // system / chat scope: 记录触发，不创建 DevRun
      await tx.devReminder.update({
        where: { id: reminder.id },
        data: {
          enabled: scheduleNext.enabled,
          nextRunAt: scheduleNext.nextRunAt,
          lastTriggeredAt: now,
          lastError: null,
        },
      });

      return { runId: reminder.id, sessionId: reminder.sessionId, scope: reminder.scope };
    });

    if (!txResult) {
      return null;
    }

    // 只有 dev scope 才入队执行
    if (txResult.scope === ReminderScope.dev) {
      this.runner.startRun(txResult.runId, txResult.sessionId!);
    }

    this.logger.log(
      `Reminder triggered: reminder=${reminderId} scope=${txResult.scope} run=${txResult.runId} session=${txResult.sessionId}`,
    );
    return { runId: txResult.runId, sessionId: txResult.sessionId };
  }

  private parseRunAt(value?: string | Date): Date | undefined {
    if (!value) return undefined;
    const runAt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(runAt.getTime())) {
      throw new BadRequestException('runAt must be a valid date');
    }
    return runAt;
  }

  private assertScheduleInput(
    cronExpr?: string,
    runAt?: Date,
    timezone?: string,
  ): void {
    if (!cronExpr && !runAt) {
      throw new BadRequestException('cronExpr or runAt is required');
    }
    if (cronExpr && runAt) {
      throw new BadRequestException('cronExpr and runAt cannot be used together');
    }

    if (cronExpr) {
      const validateResult = validateCronExpression(cronExpr);
      if (!validateResult.valid) {
        throw new BadRequestException(`invalid cronExpr: ${validateResult.error}`);
      }

      try {
        // 使用 CronJob 构造验证 timezone 与表达式组合
        // eslint-disable-next-line no-new
        new CronJob(cronExpr, () => undefined, null, false, timezone);
      } catch (err) {
        throw new BadRequestException(`invalid cron/timezone: ${String(err)}`);
      }
    }
  }

  private computeNextAfterTrigger(
    reminder: {
      cronExpr: string | null;
      runAt: Date | null;
      timezone: string | null;
    },
    now: Date,
  ): { enabled: boolean; nextRunAt: Date | null } {
    if (reminder.cronExpr) {
      const nextRunAt = this.computeNextRunAt(
        {
          cronExpr: reminder.cronExpr,
          timezone: reminder.timezone ?? undefined,
        },
        now,
      );
      return {
        enabled: Boolean(nextRunAt),
        nextRunAt,
      };
    }

    // 一次性提醒触发后自动关闭
    return { enabled: false, nextRunAt: null };
  }

  private computeNextRunAt(
    schedule: {
      cronExpr?: string;
      runAt?: Date;
      timezone?: string;
    },
    now: Date,
  ): Date | null {
    if (schedule.runAt) {
      return schedule.runAt.getTime() > now.getTime() ? schedule.runAt : null;
    }
    if (!schedule.cronExpr) return null;

    const job = new CronJob(schedule.cronExpr, () => undefined, null, false, schedule.timezone);
    const next = job.nextDate();
    return typeof (next as any).toJSDate === 'function'
      ? (next as any).toJSDate()
      : new Date(String(next));
  }

  private async resolveSession(sessionId?: string, conversationId?: string) {
    if (sessionId) {
      const existing = await this.sessions.getSession(sessionId);
      if (!existing) {
        throw new NotFoundException('session not found');
      }
      return existing;
    }

    if (!conversationId) {
      throw new BadRequestException('sessionId or conversationId is required');
    }

    return this.sessions.getOrCreateSession(conversationId);
  }

  private buildReminderQueuedResult(
    reminderId: string,
    message: string,
    forced: boolean,
  ): Prisma.InputJsonValue {
    return {
      phase: 'queued',
      source: 'reminder',
      reminderId,
      currentStepId: null,
      planRounds: 0,
      completedSteps: 0,
      totalSteps: 0,
      stepLogs: [],
      events: [
        {
          type: forced ? 'manual_trigger' : 'scheduled_trigger',
          message: `提醒任务已入队：${message}`,
          at: new Date().toISOString(),
        },
      ],
    } as Prisma.InputJsonValue;
  }
}
