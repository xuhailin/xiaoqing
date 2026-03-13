import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
}

@Injectable()
export class WechatWorkApiService {
  private readonly logger = new Logger(WechatWorkApiService.name);
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  private readonly corpId: string;
  private readonly secret: string;
  private readonly agentId: string;

  constructor(config: ConfigService) {
    this.corpId = config.get('WECHAT_WORK_CORP_ID') || '';
    this.secret = config.get('WECHAT_WORK_SECRET') || '';
    this.agentId = config.get('WECHAT_WORK_AGENT_ID') || '';
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.corpId}&corpsecret=${this.secret}`;
    const { data } = await axios.get<AccessTokenResponse>(url);

    if (!data.access_token) {
      throw new Error('Failed to get access token');
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    return data.access_token;
  }

  async sendTextMessage(userId: string, content: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;

    await axios.post(url, {
      touser: userId,
      msgtype: 'text',
      agentid: this.agentId,
      text: { content },
    });
  }
}
