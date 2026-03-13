import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../../assistant/conversation/conversation.service';
import { WechatWorkBotClient } from './wechat-work-bot-client.service';

interface BotMessage {
  msgtype: string;
  from_user: string;
  text?: { content: string };
  msg_id: string;
}

@Injectable()
export class WechatWorkBotService {
  private readonly logger = new Logger(WechatWorkBotService.name);
  private client: WechatWorkBotClient | null = null;

  constructor(private readonly conversation: ConversationService) {}

  setClient(client: WechatWorkBotClient) {
    this.client = client;
  }

  async handleMessage(message: BotMessage): Promise<void> {
    if (message.msgtype !== 'text' || !message.text?.content) {
      return;
    }

    const userId = message.from_user;
    const userInput = message.text.content;

    try {
      const conversationId = `wechat_bot_${userId}`;
      const response = await this.conversation.sendMessage(conversationId, userInput);

      if (this.client) {
        this.client.sendMessage(userId, response.assistantMessage.content);
      }
    } catch (error) {
      this.logger.error('Failed to handle message', error);
    }
  }
}
