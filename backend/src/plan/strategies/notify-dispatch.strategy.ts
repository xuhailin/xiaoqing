import { Injectable, Logger } from '@nestjs/common';
import { PlanDispatchType } from '@prisma/client';
import type { Plan, TaskOccurrence } from '@prisma/client';
import type { IPlanDispatchStrategy } from '../plan-dispatcher.service';
import type { ReminderMessageService } from '../../action/skills/reminder/reminder-message.service';
import { PrismaService } from '../../infra/prisma.service';

/**
 * notify 分发策略：通过 ReminderMessageService 生成自然语言消息并推送。
 * 复用现有的聊天提醒推送能力。
 */
@Injectable()
export class NotifyDispatchStrategy implements IPlanDispatchStrategy {
  readonly type = PlanDispatchType.notify;
  private readonly logger = new Logger(NotifyDispatchStrategy.name);

  private reminderMessageService: ReminderMessageService | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** 延迟注入，避免循环依赖 */
  setReminderMessageService(service: ReminderMessageService) {
    this.reminderMessageService = service;
  }

  async dispatch(plan: Plan, occurrence: TaskOccurrence): Promise<{ resultRef?: string; resultPayload?: Record<string, unknown> }> {
    if (!this.reminderMessageService) {
      const errMsg = `ReminderMessageService not injected, cannot dispatch notify for plan=${plan.id}`;
      this.logger.error(errMsg);
      throw new Error(errMsg);
    }

    const targetConversationId =
      plan.conversationId ?? (await this.findLatestConversationForUser(plan.userId));

    this.logger.log(
      `Notify dispatch starting: planId=${plan.id}, conversationId=${targetConversationId}, sessionId=${plan.sessionId}, userId=${plan.userId}`,
    );

    await this.reminderMessageService.deliverChatReminder({
      id: plan.id,
      message: plan.description ?? plan.title ?? '',
      title: plan.title,
      sessionId: plan.sessionId,
      conversationId: targetConversationId,
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

  private async findLatestConversationForUser(userId: string): Promise<string | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        userId,
        isInternal: false,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return conversation?.id ?? null;
  }
}
