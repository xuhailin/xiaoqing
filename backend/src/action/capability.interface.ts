import type { CapabilityMeta, CapabilityRequest, CapabilityResult } from './capability.types';

/**
 * 统一能力接口 — 所有 registry 可见的能力 / 执行器实现此接口后可被 CapabilityRegistry 管理。
 *
 * 上下文边界说明见 docs/context-boundary.md：
 * - 实现 ICapability 的能力禁止依赖 ConversationService / MemoryService / ClaimEngine 等聊天上下文聚合模块。
 * - 如需使用 PrismaService，仅限访问与该能力自身业务紧密相关的表，禁止直接访问 Message/Memory/Claim/Profile。
 *
 * 设计原则：
 * - 每个能力自描述（name / taskIntent / channels / description）
 * - 运行时可查询可用性（isAvailable）
 * - 统一执行签名（execute）
 * - 不依赖 NestJS 装饰器，纯 TypeScript 接口
 */
export interface ICapability extends CapabilityMeta {
  /** 运行时是否可用（检查 env / API key 等） */
  isAvailable(): boolean;

  /** 执行能力 */
  execute(request: CapabilityRequest): Promise<CapabilityResult>;
}
