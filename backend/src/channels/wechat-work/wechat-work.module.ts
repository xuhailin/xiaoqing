import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WechatWorkController } from './wechat-work.controller';
import { WechatWorkService } from './wechat-work.service';
import { WechatWorkCryptoService } from './wechat-work-crypto.service';
import { WechatWorkApiService } from './wechat-work-api.service';
import { ConversationModule } from '../../assistant/conversation/conversation.module';

@Module({
  imports: [ConfigModule, ConversationModule],
  controllers: [WechatWorkController],
  providers: [
    WechatWorkService,
    WechatWorkCryptoService,
    WechatWorkApiService,
  ],
  exports: [WechatWorkService, WechatWorkApiService],
})
export class WechatWorkModule {}
