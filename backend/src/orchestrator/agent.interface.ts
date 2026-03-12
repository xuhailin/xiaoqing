import type { TraceStep } from '../infra/trace/trace.types';
import type { MessageChannel } from '../gateway/message-router.types';

// ──────────────────────────────────────────────
// IAgent — 统一 Agent 接口
// assistant 和 dev-agent 各自实现此接口，
// dispatcher 只面向接口调用，不关心具体实现。
// ──────────────────────────────────────────────

/** 统一请求体 */
export interface AgentRequest {
  conversationId: string;
  content: string;
  /** 原始 mode，仅供 agent 内部参考 */
  mode?: MessageChannel;
  metadata?: Record<string, unknown>;
}

/** 统一返回体 */
export interface AgentResult {
  /** 实际处理该请求的通道 */
  channel: MessageChannel;
  /** 自然语言回复（前端展示用） */
  reply: string;
  /** 各 agent 的原始返回，前端按 channel 类型解析 */
  payload: unknown;
  /** 可选追踪信息 */
  trace?: TraceStep[];
}

/** Agent 必须实现的接口 */
export interface IAgent {
  /** 该 agent 对应的通道标识 */
  readonly channel: MessageChannel;
  /** 处理请求并返回统一结果 */
  handle(req: AgentRequest): Promise<AgentResult>;
}

/**
 * NestJS DI token — 用于注入 IAgent 数组。
 * dispatcher 通过此 token 拿到所有注册的 agent。
 */
export const AGENT_TOKEN = Symbol('AGENT_TOKEN');
