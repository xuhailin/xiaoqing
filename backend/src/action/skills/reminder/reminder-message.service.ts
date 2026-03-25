import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { LlmService } from '../../../infra/llm/llm.service';
import { PrismaService } from '../../../infra/prisma.service';
import { estimateTokens } from '../../../infra/token-estimator';

export interface ReminderTriggeredEvent {
  reminderId: string;
  conversationId: string;
  message: string;
  reason: string;
  createdAt: Date;
}

@Injectable()
export class ReminderMessageService {
  private readonly logger = new Logger(ReminderMessageService.name);
  private readonly triggered$ = new Subject<ReminderTriggeredEvent>();

  constructor(
    private readonly llm: LlmService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * SSE 订阅：前端可通过此 Observable 接收提醒事件。
   */
  getReminderStream(): Observable<ReminderTriggeredEvent> {
    return this.triggered$.asObservable();
  }

  /**
   * 为到期的 chat-scope 提醒生成自然语言消息，持久化并推送。
   */
  async deliverChatReminder(reminder: {
    id: string;
    message: string;
    title?: string | null;
    sessionId?: string | null;
    conversationId?: string | null;
  }): Promise<void> {
    const reason = reminder.title ?? reminder.message;
    const naturalMessage = await this.generateNaturalMessage(reason);

    // 查找关联的 conversationId
    let conversationId: string | null = reminder.conversationId ?? null;
    if (!conversationId && reminder.sessionId) {
      const session = await this.prisma.devSession.findUnique({
        where: { id: reminder.sessionId },
        select: { conversationId: true },
      });
      conversationId = session?.conversationId ?? null;
    }

    if (!conversationId) {
      const errMsg = `No conversation found for reminder ${reminder.id}, cannot deliver`;
      this.logger.error(errMsg);
      throw new Error(errMsg);
    }

    // 持久化为 assistant 消息
    await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        kind: 'reminder_triggered',
        content: naturalMessage,
        metadata: {
          source: 'scheduler',
          reminderAction: 'trigger',
          reminderId: reminder.id,
          reminderReason: reason,
          summary: `到点提醒：${reason}`,
        },
        tokenCount: estimateTokens(naturalMessage),
      },
    });

    // 推送事件
    this.triggered$.next({
      reminderId: reminder.id,
      conversationId,
      message: naturalMessage,
      reason,
      createdAt: new Date(),
    });

    this.logger.log(`Chat reminder delivered: ${reminder.id} → conv=${conversationId}`);
  }

  private async generateNaturalMessage(reason: string): Promise<string> {
    try {
      const messages = [
        {
          role: 'system' as const,
          content: [
            '你是小晴，一个温暖贴心的 AI 伙伴。',
            '现在到了提醒时间，请用你自己自然、亲切的语气提醒用户。',
            '要求：',
            '- 不要像系统通知，要像朋友提醒',
            '- 引用提醒原因，让用户知道为什么被提醒',
            '- 简短，1-2 句话即可',
            '- 不要使用 emoji',
          ].join('\n'),
        },
        {
          role: 'user' as const,
          content: `提醒内容：${reason}\n\n请生成一条自然的提醒消息。`,
        },
      ];

      return await this.llm.generate(messages, { scenario: 'chat' });
    } catch (err) {
      this.logger.warn(`LLM reminder message generation failed, using fallback: ${String(err)}`);
      return `到时间了，提醒你一下：${reason}`;
    }
  }
}
