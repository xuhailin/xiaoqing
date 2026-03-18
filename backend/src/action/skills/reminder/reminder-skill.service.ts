import { Injectable, Logger } from '@nestjs/common';
import { ReminderScope } from '@prisma/client';
import { CronJob } from 'cron';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import { PrismaService } from '../../../infra/prisma.service';

interface ReminderParams {
  reminderAction?: 'create' | 'list' | 'cancel';
  reminderReason?: string;
  reminderSchedule?: 'once' | 'daily' | 'weekly';
  reminderTime?: string;
  reminderTarget?: string;
}

@Injectable()
export class ReminderSkillService implements ICapability {
  private readonly logger = new Logger(ReminderSkillService.name);

  readonly name = 'reminder';
  readonly taskIntent = 'set_reminder';
  readonly channels: MessageChannel[] = ['chat'];
  readonly description = '设置/查看/取消提醒（提醒我xxx、每天xx点提醒我、取消提醒、查看提醒列表）';
  readonly surface = 'assistant' as const;
  readonly scope = 'public' as const;
  readonly portability = 'portable' as const;
  readonly requiresAuth = false;
  readonly requiresUserContext = true;
  readonly visibility = 'default' as const;

  constructor(private readonly prisma: PrismaService) {}

  isAvailable(): boolean {
    return true;
  }

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    const params = request.params as ReminderParams;
    const action = params.reminderAction ?? 'create';

    try {
      switch (action) {
        case 'create':
          return await this.createReminder(request.conversationId, params);
        case 'list':
          return await this.listReminders();
        case 'cancel':
          return await this.cancelReminder(params);
        default:
          return await this.createReminder(request.conversationId, params);
      }
    } catch (err) {
      this.logger.error(`Reminder skill failed: ${String(err)}`);
      return { success: false, content: null, error: String(err) };
    }
  }

  private async createReminder(
    conversationId: string,
    params: ReminderParams,
  ): Promise<CapabilityResult> {
    const reason = params.reminderReason?.trim();
    if (!reason) {
      return {
        success: false,
        content: '需要告诉我提醒什么内容哦。',
        error: 'missing reminderReason',
      };
    }

    const schedule = this.buildSchedule(params);
    if (!schedule.cronExpr && !schedule.runAt) {
      return {
        success: false,
        content: '我没能理解提醒的时间，可以再说具体一点吗？比如"每天晚上6点"或"明天下午3点"。',
        error: 'cannot parse schedule',
      };
    }

    const now = new Date();
    const nextRunAt = schedule.runAt
      ? new Date(schedule.runAt)
      : this.computeNextCronRun(schedule.cronExpr!, now);

    if (!nextRunAt || nextRunAt.getTime() <= now.getTime()) {
      return {
        success: false,
        content: '提醒时间需要在未来哦，可以再确认一下时间吗？',
        error: 'schedule in past',
      };
    }

    const reminder = await this.prisma.devReminder.create({
      data: {
        conversationId,
        scope: ReminderScope.chat,
        title: reason,
        message: reason,
        cronExpr: schedule.cronExpr ?? null,
        runAt: schedule.runAt ? new Date(schedule.runAt) : null,
        timezone: 'Asia/Shanghai',
        enabled: true,
        nextRunAt,
      },
    });

    const scheduleDesc = this.describeSchedule(params);
    return {
      success: true,
      content: `提醒已设置：「${reason}」，${scheduleDesc}。`,
      error: null,
      meta: {
        reminderAction: 'create',
        reminderId: reminder.id,
        reminderReason: reason,
        scheduleText: scheduleDesc,
        nextRunAt: reminder.nextRunAt?.toISOString() ?? null,
      },
    };
  }

  private async listReminders(): Promise<CapabilityResult> {
    const reminders = await this.prisma.devReminder.findMany({
      where: { scope: ReminderScope.chat, enabled: true },
      orderBy: { nextRunAt: 'asc' },
    });

    if (reminders.length === 0) {
      return { success: true, content: '目前没有任何提醒。', error: null };
    }

    const lines = reminders.map((r, i) => {
      const next = r.nextRunAt
        ? r.nextRunAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        : '未定';
      const scheduleType = r.cronExpr ? '周期' : '一次性';
      return `${i + 1}. 「${r.title ?? r.message}」— ${scheduleType}，下次：${next}`;
    });

    return {
      success: true,
      content: `当前有 ${reminders.length} 个提醒：\n${lines.join('\n')}`,
      error: null,
      meta: {
        reminderAction: 'list',
        count: reminders.length,
      },
    };
  }

  private async cancelReminder(params: ReminderParams): Promise<CapabilityResult> {
    const target = params.reminderTarget?.trim();
    if (!target) {
      return {
        success: false,
        content: '需要告诉我取消哪个提醒，可以说关键词或者编号。',
        error: 'missing reminderTarget',
      };
    }

    // 按关键词模糊匹配
    const chatReminders = await this.prisma.devReminder.findMany({
      where: { scope: ReminderScope.chat, enabled: true },
    });
    const matched = chatReminders.filter(
      (r) =>
        r.id === target ||
        (r.title && r.title.includes(target)) ||
        r.message.includes(target),
    );

    if (matched.length === 0) {
      return {
        success: false,
        content: `没有找到和「${target}」相关的提醒。`,
        error: 'no match',
      };
    }

    if (matched.length === 1) {
      await this.prisma.devReminder.delete({ where: { id: matched[0].id } });
      return {
        success: true,
        content: `已取消提醒「${matched[0].title ?? matched[0].message}」。`,
        error: null,
        meta: {
          reminderAction: 'cancel',
          reminderId: matched[0].id,
          reminderReason: matched[0].title ?? matched[0].message,
        },
      };
    }

    const lines = matched.map((r, i) => `${i + 1}. 「${r.title ?? r.message}」`);
    return {
      success: true,
      content: `找到 ${matched.length} 个相关提醒，你想取消哪个？\n${lines.join('\n')}`,
      error: null,
      meta: { candidates: matched.map((r) => r.id) },
    };
  }

  private buildSchedule(params: ReminderParams): { cronExpr?: string; runAt?: string } {
    const schedule = params.reminderSchedule ?? 'once';
    const timeStr = params.reminderTime?.trim();

    if (schedule === 'daily') {
      const time = this.parseTimeHHMM(timeStr);
      if (!time) return {};
      return { cronExpr: `${time.minute} ${time.hour} * * *` };
    }

    if (schedule === 'weekly') {
      const time = this.parseTimeHHMM(timeStr);
      if (!time) return {};
      const dow = this.parseDayOfWeek(timeStr) ?? 1;
      return { cronExpr: `${time.minute} ${time.hour} * * ${dow}` };
    }

    // once: 解析为具体时间点
    const runAt = this.parseRunAt(timeStr);
    if (runAt) return { runAt: runAt.toISOString() };

    // 如果只给了 HH:MM 没给日期，默认今天/明天
    const time = this.parseTimeHHMM(timeStr);
    if (time) {
      const now = new Date();
      const target = new Date();
      target.setHours(time.hour, time.minute, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return { runAt: target.toISOString() };
    }

    return {};
  }

  private computeNextCronRun(cronExpr: string, now: Date): Date | null {
    try {
      const job = new CronJob(cronExpr, () => undefined, null, false, 'Asia/Shanghai');
      const next = job.nextDate();
      return typeof (next as any).toJSDate === 'function'
        ? (next as any).toJSDate()
        : new Date(String(next));
    } catch {
      return null;
    }
  }

  private parseTimeHHMM(str?: string): { hour: number; minute: number } | null {
    if (!str) return null;
    const match24 = str.match(/(\d{1,2}):(\d{2})/);
    if (match24) {
      return { hour: Number(match24[1]), minute: Number(match24[2]) };
    }

    const isPM = /[下午晚]/.test(str);
    const matchCN = str.match(/(\d{1,2})\s*[点时]/);
    if (matchCN) {
      let hour = Number(matchCN[1]);
      if (isPM && hour < 12) hour += 12;
      const minuteMatch = str.match(/[点时]\s*(\d{1,2})\s*分?/);
      const minute = minuteMatch ? Number(minuteMatch[1]) : 0;
      if (str.includes('半')) return { hour, minute: 30 };
      return { hour, minute };
    }

    return null;
  }

  private parseDayOfWeek(str?: string): number | null {
    if (!str) return null;
    const dayMap: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0,
    };
    for (const [key, val] of Object.entries(dayMap)) {
      if (str.includes(`周${key}`) || str.includes(`星期${key}`)) {
        return val;
      }
    }
    return null;
  }

  private parseRunAt(str?: string): Date | null {
    if (!str) return null;
    const now = new Date();

    const isTomorrow = str.includes('明天');
    const isDayAfter = str.includes('后天');
    const time = this.parseTimeHHMM(str);

    if ((isTomorrow || isDayAfter) && time) {
      const target = new Date();
      target.setDate(target.getDate() + (isDayAfter ? 2 : 1));
      target.setHours(time.hour, time.minute, 0, 0);
      return target;
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      return parsed;
    }

    return null;
  }

  private describeSchedule(params: ReminderParams): string {
    const schedule = params.reminderSchedule ?? 'once';
    const timeStr = params.reminderTime?.trim() ?? '';

    if (schedule === 'daily') {
      const time = this.parseTimeHHMM(timeStr);
      return time ? `每天 ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` : '每天';
    }
    if (schedule === 'weekly') {
      return `每周${timeStr || ''}`;
    }
    return timeStr ? `${timeStr}` : '一次性提醒';
  }
}
