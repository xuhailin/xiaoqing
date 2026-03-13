import type { DialogueIntentState } from '../assistant/intent/intent.types';
import type { MessageChannel } from '../gateway/message-router.types';

export type CapabilitySurface = 'assistant' | 'dev' | 'internal';
export type CapabilityScope = 'public' | 'private';
export type CapabilityPortability = 'portable' | 'config-bound' | 'environment-bound';
export type CapabilityVisibility = 'default' | 'optional' | 'local-only';

/**
 * Capability 上下文与边界说明见 docs/context-boundary.md。
 *
 * 统一能力请求：所有 tool / skill / executor 共用。
 * 由调用方（ConversationService / DevAgentService）组装。
 */
export interface CapabilityRequest {
  /**
   * 会话标识，仅用于日志与追踪。
   * 禁止在 capability 内部通过此 ID 查询 Message/Memory/Claim/Profile 等聊天上下文。
   */
  conversationId: string;
  turnId: string;
  userInput: string;
  params: Record<string, unknown>;
  intentState?: DialogueIntentState;
}

/**
 * 统一能力执行结果。
 */
export interface CapabilityResult {
  success: boolean;
  content: string | null;
  error: string | null;
  meta?: Record<string, unknown>;
}

/**
 * 能力描述元数据，用于 prompt 注入（Phase 3）。
 */
export interface CapabilityMeta {
  /** 唯一标识，如 'weather', 'book-download', 'timesheet' */
  name: string;
  /** 对应的 intent taskIntent 值，如 'weather_query' */
  taskIntent: string;
  /** 该能力可用的 channel */
  channels: MessageChannel[];
  /** 一句话描述（注入 intent prompt 用） */
  description: string;
  /** 产品暴露面：assistant / dev / internal */
  surface: CapabilitySurface;
  /** 归属范围：public / private */
  scope: CapabilityScope;
  /** 可移植性：portable / config-bound / environment-bound */
  portability: CapabilityPortability;
  /** 是否依赖登录态、账号凭证或外部鉴权 */
  requiresAuth: boolean;
  /** 是否依赖用户/会话/工作区上下文才能正确执行 */
  requiresUserContext: boolean;
  /** 暴露级别：default / optional / local-only */
  visibility: CapabilityVisibility;
}
