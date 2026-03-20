import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OpenClawAgentConfig } from './openclaw.types';

/**
 * OpenClaw Agent 注册表 — 管理多个远端 OpenClaw 实例。
 *
 * 配置来源：`OPENCLAW_AGENTS` 环境变量（JSON 数组），每项为 OpenClawAgentConfig。
 */
@Injectable()
export class OpenClawRegistryService {
  private readonly logger = new Logger(OpenClawRegistryService.name);
  private readonly agents = new Map<string, OpenClawAgentConfig>();
  private defaultAgentId: string | undefined;

  constructor(config: ConfigService) {
    const agentsJson = config.get('OPENCLAW_AGENTS');
    if (agentsJson) {
      try {
        const parsed = JSON.parse(agentsJson) as OpenClawAgentConfig[];
        for (const agentConfig of parsed) {
          if (!agentConfig.id || !agentConfig.baseUrl || !agentConfig.token) {
            this.logger.warn(`Skipping invalid agent config: missing id/baseUrl/token`);
            continue;
          }
          const normalized: OpenClawAgentConfig = {
            ...agentConfig,
            baseUrl: agentConfig.baseUrl.replace(/\/$/, ''),
            capabilities: agentConfig.capabilities ?? ['general'],
            timeout: agentConfig.timeout ?? 60,
            apiStyle: agentConfig.apiStyle ?? 'json',
            taskPath: agentConfig.taskPath ?? (agentConfig.apiStyle === 'chat' ? '/chat/completions' : '/task'),
          };
          this.agents.set(normalized.id, normalized);
          this.logger.log(
            `Registered agent: ${normalized.id} "${normalized.name}" (${normalized.baseUrl}, capabilities=${normalized.capabilities.join(',')})`,
          );
        }
        if (parsed.length > 0 && parsed[0].id) {
          this.defaultAgentId = parsed[0].id;
        }
      } catch (e) {
        this.logger.error(`Failed to parse OPENCLAW_AGENTS: ${e}`);
      }
    }

    this.logger.log(`OpenClaw registry initialized: ${this.agents.size} agent(s), default=${this.defaultAgentId ?? 'none'}`);
  }

  /** 获取指定 Agent 配置 */
  getAgent(id: string): OpenClawAgentConfig | undefined {
    return this.agents.get(id);
  }

  /** 获取默认 Agent 配置 */
  getDefaultAgent(): OpenClawAgentConfig | undefined {
    return this.defaultAgentId ? this.agents.get(this.defaultAgentId) : undefined;
  }

  /** 获取默认 Agent ID */
  getDefaultAgentId(): string | undefined {
    return this.defaultAgentId;
  }

  /** 按能力标签查找第一个可用的 Agent */
  findByCapability(capability: string): OpenClawAgentConfig | undefined {
    for (const agent of this.agents.values()) {
      if (agent.capabilities.includes(capability)) {
        return agent;
      }
    }
    return undefined;
  }

  /** 按能力标签查找所有匹配的 Agent */
  findAllByCapability(capability: string): OpenClawAgentConfig[] {
    return [...this.agents.values()].filter((a) => a.capabilities.includes(capability));
  }

  /** 列出所有已注册 Agent */
  listAll(): OpenClawAgentConfig[] {
    return [...this.agents.values()];
  }

  /** 是否有任何可用的 Agent */
  hasAny(): boolean {
    return this.agents.size > 0;
  }
}
