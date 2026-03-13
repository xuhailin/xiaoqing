import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WechatWorkBotClient } from './wechat-work-bot-client.service';
import { WechatWorkBotService } from './wechat-work-bot.service';
import { ConversationModule } from '../../assistant/conversation/conversation.module';

@Module({
  imports: [ConfigModule, ConversationModule],
  providers: [WechatWorkBotClient, WechatWorkBotService],
  exports: [WechatWorkBotClient, WechatWorkBotService],
})
export class WechatWorkBotModule {
  constructor(
    private readonly client: WechatWorkBotClient,
    private readonly service: WechatWorkBotService,
  ) {
    this.service.setClient(this.client);
  }
}
