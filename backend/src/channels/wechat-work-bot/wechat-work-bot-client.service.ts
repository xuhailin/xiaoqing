import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { WechatWorkBotService } from './wechat-work-bot.service';

@Injectable()
export class WechatWorkBotClient implements OnModuleInit {
  private readonly logger = new Logger(WechatWorkBotClient.name);
  private ws: WebSocket | null = null;
  private readonly botId: string;
  private readonly secret: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly botService: WechatWorkBotService,
  ) {
    this.botId = config.get('WECHAT_WORK_BOT_ID') || '';
    this.secret = config.get('WECHAT_WORK_BOT_SECRET') || '';
  }

  onModuleInit() {
    if (this.botId && this.secret) {
      this.connect();
    } else {
      this.logger.warn('WeChat Work Bot credentials not configured');
    }
  }

  private connect() {
    const url = `wss://api.weixin.qq.com/cgi-bin/webhook/bot?bot_id=${this.botId}&secret=${this.secret}`;

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.logger.log('Connected to WeChat Work Bot');
    });

    this.ws.on('message', async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.botService.handleMessage(message);
      } catch (error) {
        this.logger.error('Failed to handle message', error);
      }
    });

    this.ws.on('close', () => {
      this.logger.warn('Disconnected from WeChat Work Bot, reconnecting...');
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      this.logger.error('WebSocket error', error);
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  sendMessage(userId: string, content: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.ws.send(JSON.stringify({
      msgtype: 'text',
      touser: userId,
      text: { content },
    }));
  }
}
