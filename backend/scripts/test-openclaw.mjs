#!/usr/bin/env node
/**
 * OpenClaw Agent API 测试脚本。
 * 支持直连 JSON 和 chat/completions 两种 API 风格。
 *
 * 用法：node scripts/test-openclaw.mjs [次数]
 */

import { createHmac } from 'crypto';
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

/**
 * 解析 Agent 列表：从 OPENCLAW_AGENTS JSON 或 OPENCLAW_* 单实例配置
 */
function resolveAgents(env) {
  const agents = [];

  // 单实例配置（向后兼容）
  const baseUrl = (env.OPENCLAW_PLUGIN_BASE_URL || '').replace(/\/$/, '');
  if (baseUrl && env.FEATURE_OPENCLAW === 'true') {
    agents.push({
      id: env.OPENCLAW_BOT_ID || 'default',
      name: 'OpenClaw (default)',
      baseUrl,
      token: env.OPENCLAW_TOKEN || '',
      signKey: env.OPENCLAW_SIGN_KEY || '',
      apiStyle: 'json',
      taskPath: '/task',
      timeout: Number(env.OPENCLAW_TIMEOUT_SECONDS) || 60,
    });
  }

  // 多 Agent 配置
  if (env.OPENCLAW_AGENTS) {
    try {
      const parsed = JSON.parse(env.OPENCLAW_AGENTS);
      for (const a of parsed) {
        if (!a.id || !a.baseUrl || !a.token) continue;
        agents.push({
          id: a.id,
          name: a.name || a.id,
          baseUrl: a.baseUrl.replace(/\/$/, ''),
          token: a.token,
          signKey: a.signKey || '',
          apiStyle: a.apiStyle || 'json',
          taskPath: a.taskPath || (a.apiStyle === 'chat' ? '/chat/completions' : '/task'),
          timeout: a.timeout || 60,
        });
      }
    } catch (e) {
      console.error('OPENCLAW_AGENTS JSON 解析失败:', e.message);
    }
  }

  return agents;
}

async function testAgent(agent, count) {
  const url = `${agent.baseUrl}${agent.taskPath}`;
  const useChatStyle = agent.apiStyle === 'chat';

  console.log(`\n── Agent: ${agent.name} (${agent.id}) ──`);
  console.log(`  URL: ${url}`);
  console.log(`  API 风格: ${useChatStyle ? 'chat (OpenAI 兼容)' : 'json (直连)'}`);
  console.log(`  请求次数: ${count}\n`);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${agent.token}`,
  };

  for (let i = 0; i < count; i++) {
    const message = `测试消息 #${i + 1}：现在几点了？`;
    const sessionKey = 'test-script';

    const body = useChatStyle
      ? JSON.stringify({ model: 'openclaw', messages: [{ role: 'user', content: message }] })
      : JSON.stringify({ message, sessionKey, timeoutSeconds: 30 });

    // 可选 HMAC 签名
    const reqHeaders = { ...headers };
    if (agent.signKey) {
      const ts = new Date().toISOString();
      reqHeaders['X-Timestamp'] = ts;
      reqHeaders['X-Signature'] = createHmac('sha256', agent.signKey).update(`${ts}${body}`).digest('hex');
    }

    process.stdout.write(`[${i + 1}/${count}] POST ${url} ... `);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: reqHeaders,
        body,
        signal: AbortSignal.timeout(agent.timeout * 1000),
      });
      const text = await res.text();

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
}

async function run() {
  const count = Math.min(Math.max(1, parseInt(process.argv[2] || '1', 10)), 10);
  const env = { ...loadEnv(), ...process.env };
  const agents = resolveAgents(env);

  if (agents.length === 0) {
    console.error('无可用 Agent。请配置 FEATURE_OPENCLAW=true + OPENCLAW_PLUGIN_BASE_URL，或配置 OPENCLAW_AGENTS。');
    process.exit(1);
  }

  console.log(`OpenClaw Agent 测试 — 共 ${agents.length} 个 Agent`);

  for (const agent of agents) {
    await testAgent(agent, count);
  }

  console.log('\n完成');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
