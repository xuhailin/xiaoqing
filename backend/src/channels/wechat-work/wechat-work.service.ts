import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationService } from '../../assistant/conversation/conversation.service';
import { WechatWorkApiService } from './wechat-work-api.service';

interface WechatWorkMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: string;
  MsgType: string;
  Content?: string;
  MsgId: string;
  AgentID: string;
}

@Injectable()
export class WechatWorkService {
  private readonly logger = new Logger(WechatWorkService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly conversation: ConversationService,
    private readonly api: WechatWorkApiService,
  ) {}

  async handleMessage(message: WechatWorkMessage): Promise<string> {
    if (message.MsgType !== 'text' || !message.Content) {
      return '';
    }

    const userId = message.FromUserName;
    const userInput = message.Content;

    try {
      const conversationId = await this.getOrCreateConversation(userId);
      const response = await this.conversation.sendMessage(conversationId, userInput);

      await this.api.sendTextMessage(userId, response.assistantMessage.content);
      return '';
    } catch (error) {
      this.logger.error('Failed to handle message', error);
      return '';
    }
  }

  private async getOrCreateConversation(userId: string): Promise<string> {
    return `wechat_work_${userId}`;
  }
}
