import { createCipheriv, createHash, createHmac, randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  OpenClawTaskRequest,
  OpenClawTaskResult,
  OpenClawToolInvokeRequest,
} from './openclaw.types';

@Injectable()
export class OpenClawService {
  private readonly logger = new Logger(OpenClawService.name);
  /** 腾讯 Claw 插件/托管 API，鉴权：botId + token + signKey */
  private readonly botId: string;
  private readonly token: string;
  private readonly signKey: string;
  private readonly pluginBaseUrl: string;
  /** 任务委派路径，以腾讯托管 API 文档为准，默认 wecom（腾讯企业微信入口，不带 v1） */
  private readonly taskPath: string;
  /** 是否使用 chat 风格：path 为 /chat 或 /chat/completions（不带 v1），body 为 model + messages；否则为 task/wecom 风格 botId+message+sessionKey */
  private readonly useChatStyle: boolean;
  /** 实际请求路径（不带 v1）：wecom→/wecom，chat→/chat，chat/completions→/chat/completions */
  private readonly effectivePath: string;
  private readonly defaultTimeout: number;
  private readonly isWecomPath: boolean;
  /** 企业微信回调签名用 token（OPENCLAW_WECOM_TOKEN，缺省用 OPENCLAW_TOKEN） */
  private readonly wecomToken: string;
  /** 企业微信 EncodingAESKey（43 字符）；有则请求体用 XML+Encrypt 加密 */
  private readonly wecomEncodingAesKey: string;
  /** 企业微信企业 ID（corpid）；加密包 receiveId + 明文 ToUserName，企业应用回调必须为 corpid */
  private readonly wecomCorpId: string;
  /** 企业微信应用 id（AgentID），明文 XML 必填，整型字符串（如 1000002） */
  private readonly wecomAgentId: string;
  /** wecom 非加密时的 body 风格：openclaw | wecom_callback | wecom_send */
  private readonly wecomBodyStyle: string;
  /** 是否启用 OpenClaw 远端调用（FEATURE_OPENCLAW=true 时才发起请求） */
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.botId = config.get('OPENCLAW_BOT_ID') || '';
    this.token = config.get('OPENCLAW_TOKEN') || '';
    this.signKey = config.get('OPENCLAW_SIGN_KEY') || '';
    this.pluginBaseUrl = (config.get('OPENCLAW_PLUGIN_BASE_URL') || '').replace(/\/$/, '');
    const pathRaw = (config.get('OPENCLAW_TASK_PATH') || 'wecom').trim().toLowerCase();
    const pathNorm = pathRaw.startsWith('/') ? pathRaw.slice(1) : pathRaw;
    this.taskPath = pathNorm.startsWith('/') ? pathNorm : `/${pathNorm}`;
    if (pathNorm === 'wecom') {
      this.effectivePath = '/wecom';
      this.useChatStyle = false;
      this.isWecomPath = true;
    } else if (pathNorm === 'chat' || pathNorm === '/chat') {
      this.effectivePath = '/chat';
      this.useChatStyle = true;
      this.isWecomPath = false;
    } else if (pathNorm.includes('chat/completions')) {
      this.effectivePath = pathNorm.includes('/') ? `/${pathNorm}` : '/chat/completions';
      this.useChatStyle = true;
      this.isWecomPath = false;
    } else {
      this.effectivePath = this.taskPath;
      this.useChatStyle = false;
      this.isWecomPath = false;
    }
    this.defaultTimeout =
      Number(config.get('OPENCLAW_TIMEOUT_SECONDS')) || 60;
    this.wecomToken = config.get('OPENCLAW_WECOM_TOKEN') || this.token;
    this.wecomEncodingAesKey = config.get('OPENCLAW_WECOM_ENCODING_AES_KEY') || '';
    this.wecomCorpId = config.get('OPENCLAW_WECOM_CORP_ID') || '';
    this.wecomAgentId = config.get('OPENCLAW_WECOM_AGENT_ID') || '';
    this.wecomBodyStyle = (config.get('OPENCLAW_WECOM_BODY_STYLE') || 'openclaw').toString().toLowerCase();
    this.enabled = config.get('FEATURE_OPENCLAW') === 'true';
  }

  /**
   * 企业微信回调签名：msg_signature = sha1(sort(token, timestamp, nonce, msg_encrypt))，十六进制小写。
   * 见：https://developer.work.weixin.qq.com/document/path/90968
   */
  private wecomMsgSignature(token: string, timestamp: string, nonce: string, msgEncrypt: string): string {
    const sorted = [token, timestamp, nonce, msgEncrypt].sort();
    return createHash('sha1').update(sorted.join('')).digest('hex');
  }

  /**
   * 企业微信消息体加密：明文 msg 按 rand(16) + len(4) + msg + receiveid 拼接后 AES-256-CBC 加密并 Base64。
   * EncodingAESKey 43 字符，解码后 32 字节作 key，IV 取 key 前 16 字节。
   */
  /** XML CDATA 内需转义 ]]> 为 ]]>]]><![CDATA[> */
  private escapeXmlCdata(s: string): string {
    return s.replace(/\]\]>/g, ']]]]><![CDATA[>');
  }

  private wecomEncrypt(plainXml: string, encodingAesKey: string, receiveId: string): string {
    const key = Buffer.from(encodingAesKey + '=', 'base64');
    const iv = key.subarray(0, 16);
    const msgBuf = Buffer.from(plainXml, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(msgBuf.length, 0);
    const toEncrypt = Buffer.concat([
      randomBytes(16),
      lenBuf,
      msgBuf,
      Buffer.from(receiveId, 'utf8'),
    ]);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(toEncrypt), cipher.final()]);
    return encrypted.toString('base64');
  }

  /**
   * 调用腾讯云托管 Claw API 委派任务。路径统一不带 v1。
   * - wecom（推荐）：POST /wecom，body { botId, message, sessionKey, timeoutSeconds }，鉴权 Bearer + 可选 X-Timestamp/X-Signature。
   * - chat 风格：POST /chat 或 /chat/completions，body { model, messages }；若 405 则重试 GET。
   */
  async delegateTask(req: OpenClawTaskRequest): Promise<OpenClawTaskResult> {
    if (!this.enabled) {
      this.logger.warn('OpenClaw 已禁用（FEATURE_OPENCLAW=false），跳过远端调用');
      return { success: false, content: '', error: 'OpenClaw 已禁用' };
    }
    if (!this.pluginBaseUrl) {
      this.logger.warn('OpenClaw 插件未配置：OPENCLAW_PLUGIN_BASE_URL 为空');
      return { success: false, content: '', error: 'OpenClaw 插件未配置' };
    }
    const timeoutSeconds = req.timeoutSeconds ?? this.defaultTimeout;
    const basePath = `${this.pluginBaseUrl}${this.effectivePath}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
    let bodyStr: string | undefined;
    let url: string;
    let method: 'GET' | 'POST' = 'POST';
    if (this.useChatStyle) {
      const bodyObj = {
        model: 'openclaw',
        messages: [{ role: 'user' as const, content: req.message }],
      };
      bodyStr = JSON.stringify(bodyObj);
      if (this.botId) headers['x-openclaw-agent-id'] = this.botId;
      url = basePath;
    } else {
      const sessionKey = req.sessionKey ?? 'default';
      // 企业应用回调 receiveId 为企业 ID（corpid），不是机器人 id；见企业微信加解密文档
      const receiveId = this.wecomCorpId || this.botId || '';

      if (this.isWecomPath && this.wecomEncodingAesKey) {
        // WXBizMsgCrypt(token, encodingAESKey, corpId) 风格：GET 带 msg_signature、timestamp、nonce、echostr
        // 见企业微信文档 90968 验证 URL：echostr 为加密串，签名用 sha1(sort(token,timestamp,nonce,echostr))
        const createTime = Math.floor(Date.now() / 1000);
        const nonce = randomBytes(8).toString('hex');
        const timestamp = String(createTime);
        const echostrPlain = req.message;
        const echostr = this.wecomEncrypt(echostrPlain, this.wecomEncodingAesKey, receiveId || '');
        const msgSignature = this.wecomMsgSignature(this.wecomToken, timestamp, nonce, echostr);
        const query = new URLSearchParams({
          msg_signature: msgSignature,
          timestamp,
          nonce,
          echostr,
        });
        url = `${basePath}?${query.toString()}`;
        bodyStr = undefined;
        method = 'GET';
      } else {
        // wecom / task 非加密：JSON body，可选 OPENCLAW_WECOM_BODY_STYLE
        if (this.wecomBodyStyle === 'wecom_callback') {
          bodyStr = JSON.stringify({
            ToUserName: this.botId || 'default',
            FromUserName: sessionKey,
            MsgType: 'text',
            Content: req.message,
            MsgId: `${Date.now()}${Math.random().toString(36).slice(2, 10)}`,
            CreateTime: Math.floor(Date.now() / 1000),
          });
        } else if (this.wecomBodyStyle === 'wecom_send') {
          bodyStr = JSON.stringify({
            touser: sessionKey,
            msgtype: 'text',
            agentid: this.botId || '1',
            text: { content: req.message },
            safe: 0,
          });
        } else {
          bodyStr = JSON.stringify({
            botId: this.botId,
            message: req.message,
            sessionKey,
            timeoutSeconds,
          });
        }
        if (this.signKey && bodyStr !== undefined) {
          const timestamp = new Date().toISOString();
          const toSign = `${timestamp}${bodyStr}`;
          headers['X-Timestamp'] = timestamp;
          headers['X-Signature'] = createHmac('sha256', this.signKey).update(toSign).digest('hex');
        }
        url = basePath;
      }
    }
    try {
      let response = await this.doRequest(url, method, headers, bodyStr, timeoutSeconds);
      if (response.status === 405 && this.useChatStyle) {
        const getUrl = `${basePath}?message=${encodeURIComponent(req.message)}`;
        this.logger.debug(`OpenClaw POST 405，重试 GET | url=${getUrl}`);
        response = await this.doRequest(getUrl, 'GET', headers, undefined, timeoutSeconds);
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(
          `OpenClaw 插件 API 请求失败 | url=${response.url} | method=${response.requestMethod} | status=${response.status} ${response.statusText} | body=${text}`,
        );
        return {
          success: false,
          content: '',
          error: text ? `OpenClaw ${response.status}: ${text}` : `OpenClaw 返回 HTTP ${response.status}`,
        };
      }
      const raw = await response.text();
      if (this.useChatStyle) {
        return this.parseChatCompletionsResponse(raw);
      }
      return { success: true, content: raw };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `OpenClaw delegateTask 异常 | url=${url} | error=${msg}${stack ? ` | stack=${stack}` : ''}`,
      );
      return {
        success: false,
        content: '',
        error: msg,
      };
    }
  }

  private async doRequest(
    url: string,
    method: 'GET' | 'POST',
    headers: Record<string, string>,
    body: string | undefined,
    timeoutSeconds: number,
  ): Promise<Response & { requestMethod?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
    const res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined && method === 'POST' ? { body } : {}),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    (res as Response & { requestMethod?: string }).requestMethod = method;
    return res as Response & { requestMethod?: string };
  }

  /** 解析 chat/completions 风格响应，提取 choices[0].message.content */
  private parseChatCompletionsResponse(raw: string): OpenClawTaskResult {
    try {
      const json = JSON.parse(raw) as {
        choices?: Array<{ message?: { content?: string }; text?: string }>;
        error?: { message?: string };
      };
      if (json.error?.message) {
        return { success: false, content: '', error: json.error.message };
      }
      const content =
        json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? '';
      return { success: true, content };
    } catch {
      return { success: true, content: raw };
    }
  }

  /**
   * 若插件支持直接调工具则调用插件工具接口；否则转为任务委派（占位实现）。
   * 鉴权方式同 delegateTask。
   */
  async invokeTool(req: OpenClawToolInvokeRequest): Promise<OpenClawTaskResult> {
    const message = `调用工具：${req.tool}，参数：${JSON.stringify(req.args ?? {})}`;
    return this.delegateTask({
      message,
      sessionKey: req.sessionKey,
    });
  }

  /** 基础可用性检查（同步）：用于能力路由阶段快速判断是否可用。 */
  isAvailable(): boolean {
    return this.enabled && !!this.pluginBaseUrl;
  }

  /** 插件 API 可达性检查（异步健康探测），使用同一套 botId/token/signKey。 */
  async checkHealth(): Promise<boolean> {
    if (!this.pluginBaseUrl) return false;
    try {
      const url = `${this.pluginBaseUrl}/health`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
      };
      if (this.botId) headers['X-Bot-Id'] = this.botId;
      const res = await fetch(url, { method: 'GET', headers });
      return res.ok;
    } catch {
      return false;
    }
  }
}
