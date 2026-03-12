import type { DialogueIntentState } from '../assistant/intent/intent.types';
import type { MessageChannel } from '../gateway/message-router.types';

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
}
