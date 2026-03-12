#!/usr/bin/env node
/**
 * OpenClaw / wecom 插件 API 测试脚本。
 * wecom 且配置 OPENCLAW_WECOM_ENCODING_AES_KEY 时，优先用企业微信 XML+Encrypt + query(msg_signature,timestamp,nonce) 测一次；
 * 否则 wecom 时尝试多种参数组合，最多 10 次。
 *
 * 用法：node scripts/test-openclaw.mjs [次数]
 */

import { createCipheriv, createHash, createHmac, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const envPath = resolve(root, '.env');

function loadEnv() {
  try {
    const raw = readFileSync(envPath, 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) {
        const v = m[2].replace(/^["']|["']$/g, '').trim();
        env[m[1]] = v;
      }
    }
    return env;
  } catch (e) {
    console.error('读取 .env 失败:', e.message);
    process.exit(1);
  }
}

const MAX_REQUESTS = 10;

function wecomMsgSignature(token, timestamp, nonce, msgEncrypt) {
  const sorted = [token, timestamp, nonce, msgEncrypt].sort();
  return createHash('sha1').update(sorted.join('')).digest('hex');
}

function wecomEncrypt(plainXml, encodingAesKey, receiveId) {
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

function buildWecomAttempts(baseUrl, token, botId, signKey, message, sessionKey, timeoutSeconds, wecomToken, encodingAesKey, wecomCorpId, wecomAgentId) {
  const createTime = Math.floor(Date.now() / 1000);
  const msgId = `${createTime}${Math.random().toString(36).slice(2, 10)}`;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 1) OpenClaw 风格（当前后端用的）
  const bodyOpenClaw = JSON.stringify({
    botId: botId || '',
    message,
    sessionKey,
    timeoutSeconds,
  });

  // 2) 腾讯企业微信 - 接收消息回调体（用户发消息时企业微信 POST 到回调的格式）
  const bodyWecomCallback = JSON.stringify({
    ToUserName: botId || 'default',
    FromUserName: sessionKey,
    MsgType: 'text',
    Content: message,
    MsgId: msgId,
    CreateTime: createTime,
  });

  // 3) 腾讯企业微信 - 发送应用消息体（调用发送消息 API 的格式）
  const bodyWecomSend = JSON.stringify({
    touser: sessionKey,
    msgtype: 'text',
    agentid: botId || '1',
    text: { content: message },
    safe: 0,
  });

  if (signKey) {
    const ts = new Date().toISOString();
    const toSign = `${ts}${bodyOpenClaw}`;
    headers['X-Timestamp'] = ts;
    headers['X-Signature'] = createHmac('sha256', signKey).update(toSign).digest('hex');
  }
  const q = (obj) => new URLSearchParams(obj).toString();

  const attempts = [];
  if (encodingAesKey && (wecomToken || token)) {
    const receiveId = wecomCorpId || botId || '';
    const xmlParts = [
      '<xml>',
      `<ToUserName><![CDATA[${receiveId || 'default'}]]></ToUserName>`,
      `<FromUserName><![CDATA[${sessionKey}]]></FromUserName>`,
      `<CreateTime>${createTime}</CreateTime>`,
      '<MsgType><![CDATA[text]]></MsgType>',
      `<Content><![CDATA[${message.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></Content>`,
      `<MsgId>${msgId}</MsgId>`,
    ];
    if (wecomAgentId) xmlParts.splice(-1, 0, `<AgentID>${wecomAgentId}</AgentID>`);
    xmlParts.push('</xml>');
    const plainXml = xmlParts.join('');
    const msgEncrypt = wecomEncrypt(plainXml, encodingAesKey, receiveId || '');
    const timestamp = String(createTime);
    const nonce = randomBytes(8).toString('hex');
    const msgSignature = wecomMsgSignature(wecomToken || token, timestamp, nonce, msgEncrypt);
    const encUrl = `${baseUrl}?${q({ msg_signature: msgSignature, timestamp, nonce })}`;
    const encBody = `<xml><Encrypt><![CDATA[${msgEncrypt}]]></Encrypt></xml>`;
    // WXBizMsgCrypt 风格：GET 带 echostr（URL 验证时企业微信发 GET，此处我们主动 GET 试探网关是否支持）
    const echostrPlain = message;
    const echostr = wecomEncrypt(echostrPlain, encodingAesKey, receiveId || '');
    const echoSignature = wecomMsgSignature(wecomToken || token, timestamp, nonce, echostr);
    attempts.push({
      name: 'GET wecom URL验证风格(msg_signature,timestamp,nonce,echostr)',
      method: 'GET',
      url: `${baseUrl}?${q({ msg_signature: echoSignature, timestamp, nonce, echostr })}`,
      headers: { ...headers },
      body: undefined,
    });
    attempts.push({
      name: 'wecom XML+Encrypt + query(msg_signature,timestamp,nonce)',
      method: 'POST',
      url: encUrl,
      headers: { ...headers, 'Content-Type': 'application/xml' },
      body: encBody,
    });
    attempts.push({
      name: 'wecom JSON body {Encrypt:base64} + same query',
      method: 'POST',
      url: encUrl,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ Encrypt: msgEncrypt }),
    });
    attempts.push({
      name: 'wecom JSON body {encrypt:base64} + same query',
      method: 'POST',
      url: encUrl,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ encrypt: msgEncrypt }),
    });
    // Encrypt 放到 query，body 空或最小 JSON
    const encQueryWithEncrypt = { msg_signature: msgSignature, timestamp, nonce, encrypt: msgEncrypt };
    attempts.push({
      name: 'wecom query(msg_signature,timestamp,nonce,encrypt) + body empty JSON',
      method: 'POST',
      url: `${baseUrl}?${q(encQueryWithEncrypt)}`,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    });
    attempts.push({
      name: 'wecom query(msg_signature,timestamp,nonce,Encrypt) + body empty JSON',
      method: 'POST',
      url: `${baseUrl}?${q({ msg_signature: msgSignature, timestamp, nonce, Encrypt: msgEncrypt })}`,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    });
  }
  attempts.push(
    { name: '腾讯-接收消息回调体(ToUserName,FromUserName,MsgType,Content,MsgId,CreateTime)', method: 'POST', url: baseUrl, headers: { ...headers }, body: bodyWecomCallback },
    { name: '腾讯-发送应用消息体(touser,msgtype,agentid,text.content)', method: 'POST', url: baseUrl, headers: { ...headers }, body: bodyWecomSend },
    { name: 'OpenClaw body only(botId,message,sessionKey,timeoutSeconds)', method: 'POST', url: baseUrl, headers: { ...headers }, body: bodyOpenClaw },
    {
      name: 'OpenClaw + query message,sessionKey,botId',
      method: 'POST',
      url: `${baseUrl}?${q({ message, sessionKey, ...(botId ? { botId } : {}) })}`,
      headers: { ...headers },
      body: bodyOpenClaw,
    },
    {
      name: '腾讯回调体 + query Content,FromUserName',
      method: 'POST',
      url: `${baseUrl}?${q({ Content: message, FromUserName: sessionKey, ToUserName: botId || 'default' })}`,
      headers: { ...headers },
      body: bodyWecomCallback,
    },
    {
      name: 'GET + query message,sessionKey,botId',
      method: 'GET',
      url: `${baseUrl}?${q({ message, sessionKey, ...(botId ? { botId } : {}) })}`,
      headers: { Authorization: headers.Authorization },
      body: undefined,
    },
    {
      name: '腾讯回调体 + query msg_signature,timestamp,nonce(验证风格)',
      method: 'POST',
      url: `${baseUrl}?timestamp=${createTime}&nonce=${msgId.slice(0, 8)}`,
      headers: { ...headers },
      body: bodyWecomCallback,
    },
    { name: 'POST + query message only', method: 'POST', url: `${baseUrl}?message=${encodeURIComponent(message)}`, headers: { ...headers }, body: bodyOpenClaw },
    { name: 'POST 腾讯发送体 + query', method: 'POST', url: `${baseUrl}?${q({ content: message, touser: sessionKey })}`, headers: { ...headers }, body: bodyWecomSend },
    { name: 'POST 腾讯回调体 Content in query', method: 'POST', url: `${baseUrl}?Content=${encodeURIComponent(message)}&MsgType=text`, headers: { ...headers }, body: bodyWecomCallback },
  );
  return attempts.slice(0, MAX_REQUESTS);
}

async function run() {
  const count = Math.min(Math.max(1, parseInt(process.argv[2] || '1', 10)), MAX_REQUESTS);
  const env = { ...loadEnv(), ...process.env };
  const baseUrl = (env.OPENCLAW_PLUGIN_BASE_URL || '').replace(/\/$/, '');
  const pathRaw = (env.OPENCLAW_TASK_PATH || 'wecom').trim().toLowerCase().replace(/^\/*/, '');
  const token = env.OPENCLAW_TOKEN || '';
  const botId = env.OPENCLAW_BOT_ID || '';
  const signKey = env.OPENCLAW_SIGN_KEY || '';

  if (!baseUrl) {
    console.error('OPENCLAW_PLUGIN_BASE_URL 未配置');
    process.exit(1);
  }

  const effectivePath =
    pathRaw === 'wecom'
      ? '/wecom'
      : pathRaw === 'chat' || pathRaw === '/chat'
        ? '/chat'
        : pathRaw.includes('chat/completions')
          ? pathRaw.includes('/')
            ? '/' + pathRaw
            : '/chat/completions'
          : '/' + pathRaw;
  const useChatStyle =
    pathRaw === 'chat' ||
    pathRaw === '/chat' ||
    pathRaw.includes('chat/completions');
  const url = `${baseUrl}${effectivePath}`;

  const isWecom = effectivePath === '/wecom';

  console.log('OpenClaw 测试（路径不带 v1）');
  console.log('  URL:', url);
  console.log(
    '  模式:',
    isWecom ? 'Wecom 探参（与 OpenClaw 同参：botId, message, sessionKey, timeoutSeconds）' : useChatStyle ? 'Chat (model+messages)' : 'Task',
  );
  console.log('  最多请求:', isWecom ? MAX_REQUESTS : count);
  console.log('');

  if (isWecom) {
    const message = '测试消息：现在几点了？';
    const sessionKey = 'test-script';
    const timeoutSeconds = 30;
    const wecomToken = env.OPENCLAW_WECOM_TOKEN || token;
    const encodingAesKey = env.OPENCLAW_WECOM_ENCODING_AES_KEY || '';
    const wecomCorpId = env.OPENCLAW_WECOM_CORP_ID || '';
    const wecomAgentId = env.OPENCLAW_WECOM_AGENT_ID || '';
    const attempts = buildWecomAttempts(baseUrl + effectivePath, token, botId, signKey, message, sessionKey, timeoutSeconds, wecomToken, encodingAesKey, wecomCorpId, wecomAgentId);
    let lastStatus = null;
    let lastBody = null;
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      process.stdout.write(`[${i + 1}/${attempts.length}] ${a.name} ... `);
      try {
        const res = await fetch(a.url, {
          method: a.method,
          headers: a.headers,
          body: a.body,
          signal: AbortSignal.timeout(30000),
        });
        const text = await res.text();
        lastStatus = res.status;
        lastBody = text;
        if (res.ok) {
          console.log(`OK ${res.status}`);
          console.log('  响应:', text.slice(0, 200) + (text.length > 200 ? '...' : ''));
          console.log('\n（成功，其它组合未再尝试）');
          return;
        }
        const known = text.includes('missing query params');
        console.log(`${res.status} ${res.statusText}${known ? ' (missing query params)' : ''}`);
        if (!known) {
          console.log('  >>> 其它报错，需关注:', text.slice(0, 300));
        }
      } catch (err) {
        console.log('异常:', err.message);
      }
    }
    console.log('\n完成（全部未 200）。最后一次:', lastStatus, lastBody?.slice(0, 120));
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (botId && useChatStyle) headers['x-openclaw-agent-id'] = botId;

  for (let i = 0; i < count; i++) {
    const message = `测试消息 #${i + 1}：现在几点了？`;
    const sessionKey = 'test-script';
    const body = useChatStyle
      ? JSON.stringify({
          model: 'openclaw',
          messages: [{ role: 'user', content: message }],
        })
      : JSON.stringify({
          botId,
          message,
          sessionKey,
          timeoutSeconds: 30,
        });
    process.stdout.write(`[${i + 1}/${count}] POST ${url} ... `);
    try {
      let res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30000),
      });
      let text = await res.text();
      if (res.status === 405 && useChatStyle) {
        const getUrl = `${url}?message=${encodeURIComponent(message)}`;
        process.stdout.write(`405→GET ... `);
        res = await fetch(getUrl, {
          method: 'GET',
          headers: { Authorization: headers.Authorization, ...(botId ? { 'x-openclaw-agent-id': botId } : {}) },
          signal: AbortSignal.timeout(30000),
        });
        text = await res.text();
      }
      if (!res.ok) {
        console.log(`失败 ${res.status} ${res.statusText}`);
        console.log('  响应:', text.slice(0, 200));
        continue;
      }
      if (useChatStyle) {
        try {
          const json = JSON.parse(text);
          const content = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? text;
          console.log('OK');
          console.log('  回复:', (content || '(空)').slice(0, 120) + (content?.length > 120 ? '...' : ''));
        } catch {
          console.log('OK (原始):', text.slice(0, 80) + '...');
        }
      } else {
        console.log('OK');
        console.log('  回复:', text.slice(0, 120) + (text.length > 120 ? '...' : ''));
      }
    } catch (err) {
      console.log('异常:', err.message);
    }
  }
  console.log('\n完成');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
