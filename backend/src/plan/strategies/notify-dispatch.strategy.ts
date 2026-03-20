import { Injectable, Logger } from '@nestjs/common';
import { PlanDispatchType } from '@prisma/client';
import type { Plan, TaskOccurrence } from '@prisma/client';
import type { IPlanDispatchStrategy } from '../plan-dispatcher.service';
import type { ReminderMessageService } from '../../action/skills/reminder/reminder-message.service';

/**
 * notify 分发策略：通过 ReminderMessageService 生成自然语言消息并推送。
 * 复用现有的聊天提醒推送能力。
 */
@Injectable()
export class NotifyDispatchStrategy implements IPlanDispatchStrategy {
  readonly type = PlanDispatchType.notify;
  private readonly logger = new Logger(NotifyDispatchStrategy.name);

  private reminderMessageService: ReminderMessageService | null = null;

  /** 延迟注入，避免循环依赖 */
  setReminderMessageService(service: ReminderMessageService) {
    this.reminderMessageService = service;
  }

  async dispatch(plan: Plan, occurrence: TaskOccurrence): Promise<{ resultRef?: string; resultPayload?: Record<string, unknown> }> {
    if (!this.reminderMessageService) {
      this.logger.warn(`ReminderMessageService not injected, skipping notify for plan=${plan.id}`);
      return {};
    }

    await this.reminderMessageService.deliverChatReminder({
      id: plan.id,
      message: plan.description ?? plan.title ?? '',
      title: plan.title,
      sessionId: plan.sessionId,
      conversationId: plan.conversationId,
    });

    return {
      resultRef: `message:${occurrence.id}`,
      resultPayload: {
        channel: 'chat',
        delivered: true,
        message: plan.description ?? plan.title ?? '',
      },
    };
  }
}
