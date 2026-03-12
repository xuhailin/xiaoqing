"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OpenClawService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawService = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let OpenClawService = OpenClawService_1 = class OpenClawService {
    logger = new common_1.Logger(OpenClawService_1.name);
    botId;
    token;
    signKey;
    pluginBaseUrl;
    taskPath;
    useChatStyle;
    effectivePath;
    defaultTimeout;
    isWecomPath;
    wecomToken;
    wecomEncodingAesKey;
    wecomCorpId;
    wecomAgentId;
    wecomBodyStyle;
    enabled;
    constructor(config) {
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
        }
        else if (pathNorm === 'chat' || pathNorm === '/chat') {
            this.effectivePath = '/chat';
            this.useChatStyle = true;
            this.isWecomPath = false;
        }
        else if (pathNorm.includes('chat/completions')) {
            this.effectivePath = pathNorm.includes('/') ? `/${pathNorm}` : '/chat/completions';
            this.useChatStyle = true;
            this.isWecomPath = false;
        }
        else {
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
    wecomMsgSignature(token, timestamp, nonce, msgEncrypt) {
        const sorted = [token, timestamp, nonce, msgEncrypt].sort();
        return (0, crypto_1.createHash)('sha1').update(sorted.join('')).digest('hex');
    }
    escapeXmlCdata(s) {
        return s.replace(/\]\]>/g, ']]]]><![CDATA[>');
    }
    wecomEncrypt(plainXml, encodingAesKey, receiveId) {
        const key = Buffer.from(encodingAesKey + '=', 'base64');
        const iv = key.subarray(0, 16);
        const msgBuf = Buffer.from(plainXml, 'utf8');
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(msgBuf.length, 0);
        const toEncrypt = Buffer.concat([
            (0, crypto_1.randomBytes)(16),
            lenBuf,
            msgBuf,
            Buffer.from(receiveId, 'utf8'),
        ]);
        const cipher = (0, crypto_1.createCipheriv)('aes-256-cbc', key, iv);
        const encrypted = Buffer.concat([cipher.update(toEncrypt), cipher.final()]);
        return encrypted.toString('base64');
    }
    async delegateTask(req) {
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
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
        };
        let bodyStr;
        let url;
        let method = 'POST';
        if (this.useChatStyle) {
            const bodyObj = {
                model: 'openclaw',
                messages: [{ role: 'user', content: req.message }],
            };
            bodyStr = JSON.stringify(bodyObj);
            if (this.botId)
                headers['x-openclaw-agent-id'] = this.botId;
            url = basePath;
        }
        else {
            const sessionKey = req.sessionKey ?? 'default';
            const receiveId = this.wecomCorpId || this.botId || '';
            if (this.isWecomPath && this.wecomEncodingAesKey) {
                const createTime = Math.floor(Date.now() / 1000);
                const nonce = (0, crypto_1.randomBytes)(8).toString('hex');
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
            }
            else {
                if (this.wecomBodyStyle === 'wecom_callback') {
                    bodyStr = JSON.stringify({
                        ToUserName: this.botId || 'default',
                        FromUserName: sessionKey,
                        MsgType: 'text',
                        Content: req.message,
                        MsgId: `${Date.now()}${Math.random().toString(36).slice(2, 10)}`,
                        CreateTime: Math.floor(Date.now() / 1000),
                    });
                }
                else if (this.wecomBodyStyle === 'wecom_send') {
                    bodyStr = JSON.stringify({
                        touser: sessionKey,
                        msgtype: 'text',
                        agentid: this.botId || '1',
                        text: { content: req.message },
                        safe: 0,
                    });
                }
                else {
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
                    headers['X-Signature'] = (0, crypto_1.createHmac)('sha256', this.signKey).update(toSign).digest('hex');
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
                this.logger.warn(`OpenClaw 插件 API 请求失败 | url=${response.url} | method=${response.requestMethod} | status=${response.status} ${response.statusText} | body=${text}`);
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            this.logger.error(`OpenClaw delegateTask 异常 | url=${url} | error=${msg}${stack ? ` | stack=${stack}` : ''}`);
            return {
                success: false,
                content: '',
                error: msg,
            };
        }
    }
    async doRequest(url, method, headers, body, timeoutSeconds) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
        const res = await fetch(url, {
            method,
            headers,
            ...(body !== undefined && method === 'POST' ? { body } : {}),
            signal: controller.signal,
        });
        clearTimeout(timeout);
        res.requestMethod = method;
        return res;
    }
    parseChatCompletionsResponse(raw) {
        try {
            const json = JSON.parse(raw);
            if (json.error?.message) {
                return { success: false, content: '', error: json.error.message };
            }
            const content = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? '';
            return { success: true, content };
        }
        catch {
            return { success: true, content: raw };
        }
    }
    async invokeTool(req) {
        const message = `调用工具：${req.tool}，参数：${JSON.stringify(req.args ?? {})}`;
        return this.delegateTask({
            message,
            sessionKey: req.sessionKey,
        });
    }
    isAvailable() {
        return this.enabled && !!this.pluginBaseUrl;
    }
    async checkHealth() {
        if (!this.pluginBaseUrl)
            return false;
        try {
            const url = `${this.pluginBaseUrl}/health`;
            const headers = {
                Authorization: `Bearer ${this.token}`,
            };
            if (this.botId)
                headers['X-Bot-Id'] = this.botId;
            const res = await fetch(url, { method: 'GET', headers });
            return res.ok;
        }
        catch {
            return false;
        }
    }
};
exports.OpenClawService = OpenClawService;
exports.OpenClawService = OpenClawService = OpenClawService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenClawService);
//# sourceMappingURL=openclaw.service.js.map