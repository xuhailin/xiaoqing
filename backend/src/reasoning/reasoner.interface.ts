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

export interface ReasoningResult {
  decision: 'direct_reply' | 'run_capability' | 'run_chain' | 'handoff';
  capabilities: string[];
  params?: Record<string, any>;
  reasoning?: string;
}

export interface IReasoner {
  reason(context: ReasoningContext): Promise<ReasoningResult>;
}
