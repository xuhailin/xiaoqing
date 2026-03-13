import { Injectable, Logger } from '@nestjs/common';
import type { MessageChannel } from '../gateway/message-router.types';
import type { ICapability } from './capability.interface';
import type { CapabilityMeta, CapabilityRequest, CapabilityResult, CapabilitySurface } from './capability.types';

interface CapabilityCatalogFilter {
  surface?: CapabilitySurface;
  includeOptional?: boolean;
  includeLocalOnly?: boolean;
}

/**
 * 能力注册表 — 统一管理所有 registry 可见 capability / executor。
 *
 * 使用方式：
 * 1. 各 skill/tool 在 Module.onModuleInit() 中调用 register() 注册自己
 * 2. ConversationService 通过 findByTaskIntent() 查找可用能力
 * 3. DevAgentService 通过 get() 按 name 查找执行器
 * 4. Intent prompt 通过 listAvailable() 动态注入能力列表
 */
@Injectable()
export class CapabilityRegistry {
  private readonly logger = new Logger(CapabilityRegistry.name);
  private readonly capabilities = new Map<string, ICapability>();

  /**
   * 注册一个能力。重复注册同名能力会覆盖（方便测试）。
   */
  register(capability: ICapability): void {
    this.capabilities.set(capability.name, capability);
    this.logger.log(
      `Registered capability: ${capability.name} (taskIntent=${capability.taskIntent}, channels=${capability.channels.join(',')})`,
    );
  }

  /**
   * 按 name 精确查找。
   */
  get(name: string): ICapability | undefined {
    return this.capabilities.get(name);
  }

  /**
   * 按 taskIntent + channel 查找第一个可用的能力。
   * 用于 ConversationService.decideToolPolicy() 替代硬编码的 if-else。
   */
  findByTaskIntent(taskIntent: string, channel: MessageChannel): ICapability | undefined {
    for (const cap of this.capabilities.values()) {
      if (cap.taskIntent === taskIntent && cap.channels.includes(channel) && cap.isAvailable()) {
        return cap;
      }
    }
    return undefined;
  }

  /**
   * 列出指定 channel 下所有当前可用的能力。
   * @deprecated 使用 listExposed(channel, { surface }) 替代，以避免 surface 泄漏
   */
  listAvailable(channel: MessageChannel): ICapability[] {
    this.logger.warn(
      `listAvailable() is deprecated and may cause surface leakage. Use listExposed(channel, { surface }) instead.`,
    );
    return [...this.capabilities.values()].filter(
      (c) => c.channels.includes(channel) && c.isAvailable(),
    );
  }

  /**
   * 按 channel + surface + visibility 过滤得到可暴露的能力 catalog。
   * 用于 assistant / dev 各自构建 prompt，避免不同 surface 相互污染。
   */
  listExposed(channel: MessageChannel, filter: CapabilityCatalogFilter = {}): ICapability[] {
    const { surface, includeOptional = true, includeLocalOnly = false } = filter;
    return this.listAvailable(channel).filter((capability) => {
      if (surface && capability.surface !== surface) return false;
      if (!includeLocalOnly && capability.visibility === 'local-only') return false;
      if (!includeOptional && capability.visibility === 'optional') return false;
      return true;
    });
  }

  /**
   * 列出所有已注册能力的元数据（不检查 isAvailable，用于调试）。
   */
  listAll(): CapabilityMeta[] {
    return [...this.capabilities.values()].map((c) => ({
      name: c.name,
      taskIntent: c.taskIntent,
      channels: c.channels,
      description: c.description,
      surface: c.surface,
      scope: c.scope,
      portability: c.portability,
      requiresAuth: c.requiresAuth,
      requiresUserContext: c.requiresUserContext,
      visibility: c.visibility,
    }));
  }

  /**
   * 生成可用能力描述文本，用于注入 intent prompt。
   * @deprecated 使用 buildExposedCapabilityPrompt(channel, { surface }) 替代
   */
  buildCapabilityPrompt(channel: MessageChannel): string {
    this.logger.warn(
      `buildCapabilityPrompt() is deprecated. Use buildExposedCapabilityPrompt(channel, { surface }) instead.`,
    );
    const available = this.listAvailable(channel);
    if (available.length === 0) return '';
    const lines = available.map(
      (c) => `- ${c.taskIntent}：${c.description}`,
    );
    return lines.join('\n');
  }

  buildExposedCapabilityPrompt(
    channel: MessageChannel,
    filter: CapabilityCatalogFilter = {},
  ): string {
    const available = this.listExposed(channel, filter);
    if (available.length === 0) return '';
    const lines = available.map((c) => `- ${c.taskIntent}：${c.description}`);
    return lines.join('\n');
  }

  /**
   * 通用能力执行入口。根据 capability name 查找并执行对应能力。
   * 用于消除上层硬编码的 capability 分支逻辑。
   */
  async execute(capabilityName: string, request: CapabilityRequest): Promise<CapabilityResult> {
    const capability = this.get(capabilityName);
    if (!capability) {
      this.logger.error(`Capability not found: ${capabilityName}`);
      return {
        success: false,
        content: null,
        error: `能力 ${capabilityName} 未注册`,
      };
    }
    if (!capability.isAvailable()) {
      this.logger.warn(`Capability not available: ${capabilityName}`);
      return {
        success: false,
        content: null,
        error: `能力 ${capabilityName} 当前不可用`,
      };
    }
    try {
      return await capability.execute(request);
    } catch (error) {
      this.logger.error(`Capability execution failed: ${capabilityName}`, error);
      return {
        success: false,
        content: null,
        error: error instanceof Error ? error.message : '执行失败',
      };
    }
  }
}
