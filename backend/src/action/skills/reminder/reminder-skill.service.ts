import { Injectable, Logger } from '@nestjs/common';
import { ReminderScope } from '@prisma/client';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import { PlanService } from '../../../plan/plan.service';

interface ReminderParams {
  reminderAction?: 'create' | 'list' | 'cancel';
  reminderReason?: string;
  reminderSchedule?: 'once' | 'daily' | 'weekday' | 'weekly';
  reminderRunAt?: string;
  reminderTime?: string;
  reminderWeekday?: number;
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

  constructor(
    private readonly planService: PlanService,
  ) {}

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
        content: '我还缺一个明确的提醒时间，比如“工作日 18:30”或“明天下午 3 点”。',
        error: 'cannot parse schedule',
      };
    }

    // 映射 reminderSchedule → Plan recurrence
    const recurrenceMap: Record<string, string> = {
      once: 'once',
      daily: 'daily',
      weekday: 'weekday',
      weekly: 'weekly',
    };
    const recurrence = recurrenceMap[params.reminderSchedule ?? 'once'] ?? 'once';

    try {
      const plan = await this.planService.createPlan({
        title: reason,
        description: reason,
        scope: ReminderScope.chat,
        dispatchType: 'notify',
        recurrence,
        cronExpr: schedule.cronExpr,
        runAt: schedule.runAt,
        timezone: 'Asia/Shanghai',
        conversationId,
      });

      const scheduleDesc = this.describeSchedule(params);
      return {
        success: true,
        content: `提醒已设置：「${reason}」，${scheduleDesc}。`,
        error: null,
        meta: {
          reminderAction: 'create',
          reminderId: plan.id,
          planId: plan.id,
          reminderReason: reason,
          scheduleText: scheduleDesc,
          nextRunAt: plan.nextRunAt?.toISOString() ?? null,
        },
      };
    } catch (err) {
      this.logger.error(`Failed to create plan: ${String(err)}`);
      return { success: false, content: '提醒设置失败，请稍后再试。', error: String(err) };
    }
  }

  private async listReminders(): Promise<CapabilityResult> {
    const plans = await this.planService.listPlans({ scope: ReminderScope.chat, status: 'active' as any });

    if (plans.length === 0) {
      return { success: true, content: '目前没有任何提醒。', error: null };
    }

    const items: { id: string; title: string; scheduleType: string; nextRunAt: Date | null }[] = plans
      .map((p) => ({
        id: p.id,
        title: p.title ?? p.description ?? '',
        scheduleType: p.recurrence === 'once' ? '一次性' : '周期',
        nextRunAt: p.nextRunAt,
      }))
      .sort((a, b) => (a.nextRunAt?.getTime() ?? Infinity) - (b.nextRunAt?.getTime() ?? Infinity));

    const lines = items.map((item, i) => {
      const next = item.nextRunAt
        ? item.nextRunAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        : '未定';
      return `${i + 1}. 「${item.title}」— ${item.scheduleType}，下次：${next}`;
    });

    return {
      success: true,
      content: `当前有 ${items.length} 个提醒：\n${lines.join('\n')}`,
      error: null,
      meta: {
        reminderAction: 'list',
        count: items.length,
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

    const plans = await this.planService.listPlans({ scope: ReminderScope.chat, status: 'active' as any });
    const matched: { id: string; title: string }[] = [];
    for (const p of plans) {
      const title = p.title ?? p.description ?? '';
      if (p.id === target || title.includes(target) || (p.description && p.description.includes(target))) {
        matched.push({ id: p.id, title });
      }
    }

    if (matched.length === 0) {
      return {
        success: false,
        content: `没有找到和「${target}」相关的提醒。`,
        error: 'no match',
      };
    }

    if (matched.length === 1) {
      const item = matched[0];
      await this.planService.lifecycle(item.id, 'archive');
      return {
        success: true,
        content: `已取消提醒「${item.title}」。`,
        error: null,
        meta: {
          reminderAction: 'cancel',
          reminderId: item.id,
          reminderReason: item.title,
        },
      };
    }

    const lines = matched.map((item, i) => `${i + 1}. 「${item.title}」`);
    return {
      success: true,
      content: `找到 ${matched.length} 个相关提醒，你想取消哪个？\n${lines.join('\n')}`,
      error: null,
      meta: { candidates: matched.map((item) => item.id) },
    };
  }

  private buildSchedule(params: ReminderParams): { cronExpr?: string; runAt?: string } {
    const schedule = params.reminderSchedule ?? 'once';
    const timeStr = params.reminderTime?.trim();

    if (schedule === 'once' && params.reminderRunAt?.trim()) {
      const runAt = this.parseRunAt(params.reminderRunAt.trim());
      if (runAt) return { runAt: runAt.toISOString() };
    }

    if (schedule === 'daily') {
      const time = this.parseTimeHHMM(timeStr);
      if (!time) return {};
      return { cronExpr: `${time.minute} ${time.hour} * * *` };
    }

    if (schedule === 'weekday') {
      const time = this.parseTimeHHMM(timeStr);
      if (!time) return {};
      return { cronExpr: `${time.minute} ${time.hour} * * 1-5` };
    }

    if (schedule === 'weekly') {
      const time = this.parseTimeHHMM(timeStr);
      if (!time) return {};
      const dow = Number.isInteger(params.reminderWeekday) ? params.reminderWeekday : this.parseDayOfWeek(timeStr);
      if (dow === null || dow === undefined) return {};
      return { cronExpr: `${time.minute} ${time.hour} * * ${dow}` };
    }

    // once: 优先尝试 ISO 8601 / 绝对时间（LLM 应直接输出此格式）
    const runAt = this.parseRunAt(timeStr);
    if (runAt) return { runAt: runAt.toISOString() };

    // 降级：相对时间正则（"2分钟后"、"半小时后"，兼容 LLM 未转换的情况）
    const relative = this.parseRelativeTime(timeStr);
    if (relative) return { runAt: relative.toISOString() };

    // 降级：纯 HH:MM，默认今天/明天
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

  private parseRelativeTime(str?: string): Date | null {
    if (!str) return null;

    // "半小时后" / "半小时"
    if (/半\s*小时/.test(str)) {
      return new Date(Date.now() + 30 * 60_000);
    }

    // "N小时M分钟后" / "一个半小时后"（放在单独匹配之前，避免被部分匹配截断）
    const hourMinMatch = str.match(/(\d+)\s*个?小时\s*(?:(\d+)\s*分钟?|半)/);
    if (hourMinMatch) {
      const hours = Number(hourMinMatch[1]);
      const mins = hourMinMatch[2] ? Number(hourMinMatch[2]) : 30;
      return new Date(Date.now() + (hours * 60 + mins) * 60_000);
    }

    // "N分钟后" / "N分后" / "从现在起 N分钟" / "N分钟"
    const minMatch = str.match(/(\d+)\s*分钟?/);
    if (minMatch) {
      return new Date(Date.now() + Number(minMatch[1]) * 60_000);
    }

    // "N小时后" / "N个小时后" / "N小时"
    const hourMatch = str.match(/(\d+)\s*个?小时/);
    if (hourMatch) {
      return new Date(Date.now() + Number(hourMatch[1]) * 3600_000);
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

    // 中文日期: "3月20日14点" / "3月20号下午2点半"
    const cnDateMatch = str.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (cnDateMatch && time) {
      const target = new Date();
      target.setMonth(Number(cnDateMatch[1]) - 1, Number(cnDateMatch[2]));
      target.setHours(time.hour, time.minute, 0, 0);
      // 如果已过，推到明年
      if (target.getTime() <= now.getTime()) {
        target.setFullYear(target.getFullYear() + 1);
      }
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
    const weekdayLabel = Number.isInteger(params.reminderWeekday)
      ? this.describeWeekday(params.reminderWeekday!)
      : '';

    if (schedule === 'daily') {
      const time = this.parseTimeHHMM(timeStr);
      return time ? `每天 ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` : '每天';
    }
    if (schedule === 'weekday') {
      const time = this.parseTimeHHMM(timeStr);
      return time ? `工作日 ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` : '工作日';
    }
    if (schedule === 'weekly') {
      const time = this.parseTimeHHMM(timeStr);
      const timeLabel = time
        ? ` ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
        : '';
      return `每周${weekdayLabel}${timeLabel}`.trim();
    }
    return params.reminderRunAt?.trim() || timeStr ? `${params.reminderRunAt?.trim() || timeStr}` : '一次性提醒';
  }

  private describeWeekday(weekday: number): string {
    switch (weekday) {
      case 0: return '日';
      case 1: return '一';
      case 2: return '二';
      case 3: return '三';
      case 4: return '四';
      case 5: return '五';
      case 6: return '六';
      default: return '';
    }
  }
}
