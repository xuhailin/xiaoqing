import { DialogueIntentState } from '../assistant/intent/intent.types';

export interface ReasoningContext {
  conversationId: string;
  turnId?: string;
  userInput: string;
  channel: 'chat' | 'dev';
  intentState?: DialogueIntentState;
  executionHistory?: ExecutionRecord[];
}

export interface ExecutionRecord {
  capability: string;
  params?: Record<string, any>;
  result?: any;
  timestamp: Date;
}

export interface ReasonerExpressionHints {
  /** 建议语气 */
  tone?: 'casual' | 'focused' | 'supportive' | 'professional';
  /** 回复重点 */
  emphasis?: string;
  /** 附加上下文 */
  context?: string;
}

export interface ReasoningResult {
  decision: 'direct_reply' | 'run_capability' | 'run_chain' | 'handoff';
  capabilities: string[];
  params?: Record<string, any>;
  reasoning?: string;
  /** 表达提示：影响下游 persona 表达层的语气/风格 */
  expressionHints?: ReasonerExpressionHints;
}

export interface IReasoner {
  reason(context: ReasoningContext): Promise<ReasoningResult>;
}
