import { Injectable, Logger } from '@nestjs/common';
import type { MessageChannel } from '../gateway/message-router.types';
import type { ICapability } from './capability.interface';
import type { CapabilityMeta } from './capability.types';

/**
 * 能力注册表 — 统一管理所有 tool / skill / executor。
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
   */
  listAvailable(channel: MessageChannel): ICapability[] {
    return [...this.capabilities.values()].filter(
      (c) => c.channels.includes(channel) && c.isAvailable(),
    );
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
    }));
  }

  /**
   * 生成可用能力描述文本，用于注入 intent prompt。
   */
  buildCapabilityPrompt(channel: MessageChannel): string {
    const available = this.listAvailable(channel);
    if (available.length === 0) return '';
    const lines = available.map(
      (c) => `- ${c.taskIntent}：${c.description}`,
    );
    return lines.join('\n');
  }
}
