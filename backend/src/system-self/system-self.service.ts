import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CapabilityRegistry } from '../action/capability-registry.service';
import type { CapabilityMeta } from '../action/capability.types';
import type { MessageChannel } from '../gateway/message-router.types';
import { isFeatureEnabled } from '../config/feature-flags';
import { OpenClawRegistryService } from '../openclaw/openclaw-registry.service';
import {
  SystemSelf,
  SystemInfo,
  AgentInfo,
  CapabilityInfo,
  ExecutorInfo,
  FeatureFlags,
  ExternalServiceInfo,
  SystemSettingsOverview,
  TokenPolicyInfo,
} from './system-self.types';

@Injectable()
export class SystemSelfService {
  private cache: SystemSelf | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 60000; // 60s

  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly config: ConfigService,
    private readonly openClawRegistry: OpenClawRegistryService,
  ) {}

  async getSystemSelf(channel?: string): Promise<SystemSelf> {
    if (this.isCacheValid()) {
      return this.filterByChannel(this.cache!, channel);
    }

    const systemSelf: SystemSelf = {
      system: this.getSystemInfo(),
      agents: this.getAgentInfo(),
      capabilities: await this.getCapabilityInfo(),
      features: this.getFeatureFlags(),
      executors: await this.getExecutorInfo(),
    };

    this.cache = systemSelf;
    this.cacheTimestamp = Date.now();
    return this.filterByChannel(systemSelf, channel);
  }

  async getCapabilities(channel?: string): Promise<CapabilityInfo[]> {
    const systemSelf = await this.getSystemSelf(channel);
    return systemSelf.capabilities;
  }

  getFeatures(): FeatureFlags {
    return this.getFeatureFlags();
  }

  async getSettingsOverview(): Promise<SystemSettingsOverview> {
    return {
      systemSelf: await this.getSystemSelf(),
      tokenPolicy: this.getTokenPolicy(),
      integrations: this.getExternalServices(),
    };
  }

  private isCacheValid(): boolean {
    return this.cache !== null && Date.now() - this.cacheTimestamp < this.CACHE_TTL;
  }

  private filterByChannel(systemSelf: SystemSelf, channel?: string): SystemSelf {
    if (!channel) return systemSelf;

    const expectedSurface = this.toSurface(channel);
    if (!expectedSurface) return systemSelf;

    return {
      ...systemSelf,
      capabilities: systemSelf.capabilities.filter(
        (c) =>
          c.surface === expectedSurface
          && (!c.channels || c.channels.includes(channel)),
      ),
    };
  }

  private getSystemInfo(): SystemInfo {
    return {
      name: 'xiaoqing',
      version: this.config.get('npm_package_version') || '0.0.0',
      environment: this.config.get('NODE_ENV') || 'development',
    };
  }

  private getAgentInfo(): AgentInfo[] {
    const xiaoqinAgentId = this.config.get<string>('XIAOQIN_OPENCLAW_AGENT_ID') || 'xiaoqin';
    const hasXiaoqin = !!this.openClawRegistry.getAgent(xiaoqinAgentId);
    return [
      { name: 'assistant', channel: 'chat', active: true },
      { name: 'dev-agent', channel: 'dev', active: true },
      { name: 'design-agent', channel: 'design', active: true },
      { name: 'xiaoqin', channel: 'collaboration', active: hasXiaoqin },
    ];
  }

  private async getCapabilityInfo(channel?: MessageChannel): Promise<CapabilityInfo[]> {
    const caps = this.getChannelScopedCapabilities(channel);
    return caps.map((c: CapabilityMeta) => ({
      name: c.name,
      description: c.description,
      taskIntent: c.taskIntent ? [c.taskIntent] : undefined,
      surface: c.surface,
      scope: c.scope,
      visibility: c.visibility,
      channels: c.channels,
    }));
  }

  private getFeatureFlags(): FeatureFlags {
    return {
      claudeCode: isFeatureEnabled(this.config, 'claudeCode'),
      planScheduler: isFeatureEnabled(this.config, 'planScheduler'),
      socialCareScheduler: isFeatureEnabled(this.config, 'socialCareScheduler'),
      socialEntityClassifierScheduler: isFeatureEnabled(this.config, 'socialEntityClassifierScheduler'),
      socialInsightScheduler: isFeatureEnabled(this.config, 'socialInsightScheduler'),
      sharedExperienceFollowupScheduler: isFeatureEnabled(this.config, 'sharedExperienceFollowupScheduler'),
      openclaw: this.openClawRegistry.hasAny(),
    };
  }

  private async getExecutorInfo(): Promise<ExecutorInfo[]> {
    const capabilities = await this.getCapabilityInfo('dev');
    return capabilities.filter((c) => c.surface === 'dev') as ExecutorInfo[];
  }

  private getChannelScopedCapabilities(channel?: MessageChannel): CapabilityMeta[] {
    if (!channel) {
      const assistantCaps = this.capabilityRegistry.listExposed('chat', {
        surface: 'assistant',
        includeOptional: true,
      });
      const devCaps = this.capabilityRegistry.listExposed('dev', {
        surface: 'dev',
        includeOptional: true,
      });
      const merged = [...assistantCaps, ...devCaps];
      const uniq = new Map<string, CapabilityMeta>();
      for (const cap of merged) {
        uniq.set(cap.name, {
          name: cap.name,
          taskIntent: cap.taskIntent,
          channels: cap.channels,
          description: cap.description,
          surface: cap.surface,
          scope: cap.scope,
          portability: cap.portability,
          requiresAuth: cap.requiresAuth,
          requiresUserContext: cap.requiresUserContext,
          visibility: cap.visibility,
        });
      }
      return [...uniq.values()];
    }

    const surface = this.toSurface(channel);
    if (!surface) return [];
    return this.capabilityRegistry.listExposed(channel, {
      surface,
      includeOptional: true,
    }).map((cap) => ({
      name: cap.name,
      taskIntent: cap.taskIntent,
      channels: cap.channels,
      description: cap.description,
      surface: cap.surface,
      scope: cap.scope,
      portability: cap.portability,
      requiresAuth: cap.requiresAuth,
      requiresUserContext: cap.requiresUserContext,
      visibility: cap.visibility,
    }));
  }

  private toSurface(channel: string): 'assistant' | 'dev' | null {
    if (channel === 'chat') return 'assistant';
    if (channel === 'dev') return 'dev';
    return null;
  }

  private getTokenPolicy(): TokenPolicyInfo {
    return {
      maxContextTokens: Number(this.config.get('MAX_CONTEXT_TOKENS')) || 3000,
      maxSystemTokens: Number(this.config.get('MAX_SYSTEM_TOKENS')) || 1200,
      memoryMidK: Number(this.config.get('MEMORY_INJECT_MID_K')) || 5,
      memoryCandidatesMaxLong: Number(this.config.get('MEMORY_CANDIDATES_MAX_LONG')) || 15,
      memoryCandidatesMaxMid: Number(this.config.get('MEMORY_CANDIDATES_MAX_MID')) || 20,
      memoryContentMaxChars: Number(this.config.get('MEMORY_CONTENT_MAX_CHARS')) || 300,
      autoSummarizeThreshold: Number(this.config.get('AUTO_SUMMARIZE_THRESHOLD')) || 15,
    };
  }

  private getExternalServices(): ExternalServiceInfo[] {
    const openclawAgents = this.openClawRegistry.listAll();
    const openclawEnabled = this.openClawRegistry.hasAny();

    return [
      {
        key: 'openclaw',
        label: 'OpenClaw',
        enabled: openclawEnabled,
        summary: openclawAgents.length
          ? `已注册 ${openclawAgents.length} 个 agent`
          : (openclawEnabled ? '功能开启，但当前没有可用 agent' : '功能未开启'),
        meta: {
          defaultAgentId: this.openClawRegistry.getDefaultAgentId() ?? null,
          agents: openclawAgents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            baseUrl: agent.baseUrl,
            capabilities: agent.capabilities,
          })),
        },
      },
    ];
  }
}
