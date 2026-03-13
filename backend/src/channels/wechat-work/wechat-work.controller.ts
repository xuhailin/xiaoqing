import { Controller, Post, Query, Body, Get, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as xml2js from 'xml2js';
import { WechatWorkCryptoService } from './wechat-work-crypto.service';
import { WechatWorkService } from './wechat-work.service';

@Controller('api/wechat-work')
export class WechatWorkController {
  private readonly logger = new Logger(WechatWorkController.name);
  private readonly token: string;
  private readonly encodingAesKey: string;
  private readonly corpId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly crypto: WechatWorkCryptoService,
    private readonly wechatWork: WechatWorkService,
  ) {
    this.token = config.get('WECHAT_WORK_TOKEN') || '';
    this.encodingAesKey = config.get('WECHAT_WORK_ENCODING_AES_KEY') || '';
    this.corpId = config.get('WECHAT_WORK_CORP_ID') || '';
  }

  @Get('callback')
  verifyUrl(
    @Query('msg_signature') signature: string,
    @Query('timestamp') timestamp: string,
    @Query('nonce') nonce: string,
    @Query('echostr') echostr: string,
  ): string {
    if (!this.verifySignature(signature, timestamp, nonce, echostr)) {
      throw new Error('Invalid signature');
    }
    return this.crypto.decrypt(this.encodingAesKey, echostr);
  }

  @Post('callback')
  async handleCallback(
    @Query('msg_signature') signature: string,
    @Query('timestamp') timestamp: string,
    @Query('nonce') nonce: string,
    @Body() body: any,
  ): Promise<string> {
    const encrypt = body.Encrypt;

    if (!this.verifySignature(signature, timestamp, nonce, encrypt)) {
      throw new Error('Invalid signature');
    }

    const decrypted = this.crypto.decrypt(this.encodingAesKey, encrypt);
    const message = await xml2js.parseStringPromise(decrypted, { explicitArray: false });

    await this.wechatWork.handleMessage(message.xml);
    return 'success';
  }

  private verifySignature(signature: string, timestamp: string, nonce: string, data: string): boolean {
    const arr = [this.token, timestamp, nonce, data].sort();
    const str = arr.join('');
    const hash = crypto.createHash('sha1').update(str).digest('hex');
    return hash === signature;
  }
}
