import type { DialogueIntentState } from '../intent/intent.types';
import type { CognitiveTurnState } from '../cognitive-pipeline/cognitive-pipeline.types';
import type { MemoryOp, ClaimOp, GrowthOp } from '../cognitive-trace/cognitive-trace.types';

/** 跨 post-turn 任务的可变数据收集器，由各任务写入、record_cognitive_observation 读取 */
export interface TurnOpsCollector {
  memoryOps: MemoryOp[];
  claimOps: ClaimOp[];
  growthOps: GrowthOp[];
}

export interface PostTurnPlan {
  conversationId: string;
  turn: {
    turnId: string;
    userMessageId: string;
    assistantMessageId: string;
    userInput: string;
    assistantOutput: string;
    now: Date;
  };
  context: {
    intentState?: DialogueIntentState | null;
    cognitiveState?: CognitiveTurnState;
    isImportantIssueInProgress?: boolean;
  };
  beforeReturn: PostTurnTask[];
  afterReturn: PostTurnTask[];
  /** 跨任务可变收集器，由 buildPostTurnPlan 初始化 */
  opsCollector: TurnOpsCollector;
}

export type PostTurnTask =
  | { type: 'daily_moment_suggestion' }
  | { type: 'life_record_sync' }
  | { type: 'record_growth' }
  | { type: 'summarize_trigger'; trigger: 'instant' | 'threshold' | 'flush' }
  | { type: 'auto_evolution_after_summary' }
  | { type: 'record_cognitive_observation' }
  | { type: 'session_reflection' };
