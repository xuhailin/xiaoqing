import { createHmac } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { OpenClawRegistryService } from './openclaw-registry.service';
import type {
  OpenClawAgentConfig,
  OpenClawTaskRequest,
  OpenClawTaskResult,
  OpenClawToolInvokeRequest,
} from './openclaw.types';

/**
 * OpenClaw 远端调用服务 — 通过 OpenClawRegistryService 管理多个 Agent 实例。
 *
 * 通信协议：纯 JSON + Bearer Token，支持两种 API 风格：
 * - json（默认）：POST {taskPath}，body { message, sessionKey, timeoutSeconds }
 * - chat：POST {taskPath}，body { model, messages }（OpenAI 兼容）
 */
@Injectable()
export class OpenClawService {
  private readonly logger = new Logger(OpenClawService.name);

  constructor(private readonly registry: OpenClawRegistryService) {}

  /** 委派任务到指定或默认 Agent */
  async delegateTask(req: OpenClawTaskRequest): Promise<OpenClawTaskResult> {
    const agent = this.resolveAgent(req.agentId);
    if (!agent) {
      const msg = req.agentId
        ? `OpenClaw Agent "${req.agentId}" 未注册`
        : 'OpenClaw 无可用 Agent（未配置 OPENCLAW_AGENTS 或解析失败）';
      this.logger.warn(msg);
      return { success: false, content: '', error: msg };
    }

    const timeoutSeconds = req.timeoutSeconds ?? agent.timeout ?? 60;
    const taskPath = agent.taskPath ?? '/task';
    const url = `${agent.baseUrl}${taskPath}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agent.token}`,
    };

    const useAgentBusTaskBridge = this.isAgentBusTaskBridge(agent);

    let bodyStr: string;
    if (agent.apiStyle === 'chat') {
      bodyStr = JSON.stringify({
        model: 'openclaw',
        messages: [{ role: 'user', content: req.message }],
      });
    } else {
      if (useAgentBusTaskBridge) {
        const delegation = this.buildAgentBusDelegationRequest({
          executorAgentId: agent.id,
          message: req.message,
          sessionKey: req.sessionKey ?? 'default',
        });
        bodyStr = JSON.stringify({
          message: `AGENT_DELEGATION_V1\n${JSON.stringify(delegation)}`,
          sessionKey: req.sessionKey ?? 'default',
          timeoutSeconds,
        });
      } else {
        bodyStr = JSON.stringify({
          message: req.message,
          sessionKey: req.sessionKey ?? 'default',
          timeoutSeconds,
        });
      }
    }

    // 可选 HMAC 签名（公网部署建议开启）
    if (agent.signKey) {
      const timestamp = new Date().toISOString();
      headers['X-Timestamp'] = timestamp;
      headers['X-Signature'] = createHmac('sha256', agent.signKey)
        .update(`${timestamp}${bodyStr}`)
        .digest('hex');
    }

    try {
      const response = await this.doRequest(url, 'POST', headers, bodyStr, timeoutSeconds);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(
          `OpenClaw API 请求失败 | agent=${agent.id} | url=${url} | status=${response.status} | body=${text}`,
        );
        return {
          success: false,
          content: '',
          error: text ? `OpenClaw ${response.status}: ${text}` : `OpenClaw 返回 HTTP ${response.status}`,
          agentId: agent.id,
        };
      }

      const raw = await response.text();
      const result = agent.apiStyle === 'chat'
        ? this.parseChatResponse(raw)
        : useAgentBusTaskBridge
          ? this.parseAgentBusTaskBridgeResponse(raw)
          : { success: true, content: raw } as OpenClawTaskResult;
      result.agentId = agent.id;
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`OpenClaw delegateTask 异常 | agent=${agent.id} | url=${url} | error=${msg}`);
      return { success: false, content: '', error: msg, agentId: agent.id };
    }
  }

  /** 工具调用（转为任务委派） */
  async invokeTool(req: OpenClawToolInvokeRequest): Promise<OpenClawTaskResult> {
    return this.delegateTask({
      message: `调用工具：${req.tool}，参数：${JSON.stringify(req.args ?? {})}`,
      sessionKey: req.sessionKey,
      agentId: req.agentId,
    });
  }

  /** 快速可用性检查（同步） */
  isAvailable(): boolean {
    return this.registry.hasAny();
  }

  /** 健康探测（异步） */
  async checkHealth(agentId?: string): Promise<boolean> {
    const agent = agentId ? this.registry.getAgent(agentId) : this.registry.getDefaultAgent();
    if (!agent) return false;
    try {
      const res = await fetch(`${agent.baseUrl}/health`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${agent.token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** 列出所有已注册 Agent（供调试/前端展示） */
  listAgents() {
    return this.registry.listAll().map(a => ({
      id: a.id,
      name: a.name,
      capabilities: a.capabilities,
      apiStyle: a.apiStyle,
    }));
  }

  private resolveAgent(agentId?: string): OpenClawAgentConfig | undefined {
    if (agentId) return this.registry.getAgent(agentId);
    return this.registry.getDefaultAgent();
  }

  private async doRequest(
    url: string,
    method: 'GET' | 'POST',
    headers: Record<string, string>,
    body: string | undefined,
    timeoutSeconds: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
    const res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined && method === 'POST' ? { body } : {}),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res;
  }

  /** 解析 chat/completions 风格响应 */
  private parseChatResponse(raw: string): OpenClawTaskResult {
    try {
      const json = JSON.parse(raw) as {
        choices?: Array<{ message?: { content?: string }; text?: string }>;
        error?: { message?: string };
      };
      if (json.error?.message) {
        return { success: false, content: '', error: json.error.message };
      }
      const content = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? '';
      return { success: true, content };
    } catch {
      return { success: true, content: raw };
    }
  }

  private isAgentBusTaskBridge(agent: OpenClawAgentConfig): boolean {
    if ((agent.capabilities ?? []).includes('agent-bus')) return true;
    return /\/agent-bus\/?$/.test(agent.baseUrl);
  }

  private buildAgentBusDelegationRequest(input: {
    executorAgentId: string;
    message: string;
    sessionKey: string;
  }) {
    const delegationId = `dlg_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    return {
      schemaVersion: 1,
      delegationId,
      requestType: 'assist_request',
      requester: {
        agentId: 'xiaoqing',
        conversationRef: input.sessionKey,
      },
      executor: {
        agentId: input.executorAgentId,
      },
      title: 'openclaw task',
      userFacingSummary: this.firstLine(input.message).slice(0, 80),
      taskIntent: 'openclaw_task',
      userInput: input.message,
      contextExcerpt: [{ role: 'user', content: input.message }],
      memoryPolicy: 'no_memory',
      responseContract: {
        mode: 'sync',
        returnViaAgentId: 'xiaoqing',
        returnToConversationRef: input.sessionKey,
      },
      extra: {
        source: 'xiaoqing-openclaw-service',
      },
    };
  }

  private parseAgentBusTaskBridgeResponse(raw: string): OpenClawTaskResult {
    try {
      const json = JSON.parse(raw) as { ok?: boolean; result?: string; error?: string };
      if (json.ok === false) {
        return { success: false, content: '', error: json.error ?? 'agent-bus bridge error' };
      }
      if (typeof json.result === 'string') {
        return { success: true, content: json.result };
      }
      // 兼容：某些实现直接返回纯文本
      return { success: true, content: raw };
    } catch {
      return { success: true, content: raw };
    }
  }

  private firstLine(text: string): string {
    const idx = text.indexOf('\n');
    return idx >= 0 ? text.slice(0, idx) : text;
  }
}
