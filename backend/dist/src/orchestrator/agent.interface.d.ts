import type { TraceStep } from '../infra/trace/trace.types';
import type { MessageChannel } from '../gateway/message-router.types';
export interface AgentRequest {
    conversationId: string;
    content: string;
    mode?: MessageChannel;
    metadata?: Record<string, unknown>;
}
export interface AgentResult {
    channel: MessageChannel;
    reply: string;
    payload: unknown;
    trace?: TraceStep[];
}
export interface IAgent {
    readonly channel: MessageChannel;
    handle(req: AgentRequest): Promise<AgentResult>;
}
export declare const AGENT_TOKEN: unique symbol;
