import type { DialogueIntentState } from '../intent/intent.types';
import type { CognitiveTurnState } from '../cognitive-pipeline/cognitive-pipeline.types';
import type { MemoryOp, ClaimOp, GrowthOp } from '../cognitive-trace/cognitive-trace.types';
import type { ActionDecision } from '../action-reasoner/action-reasoner.types';

/** 跨 post-turn 任务的可变数据收集器，由各任务写入、record_cognitive_observation 读取 */
export interface TurnOpsCollector {
  memoryOps: MemoryOp[];
  claimOps: ClaimOp[];
  growthOps: GrowthOp[];
}

export interface PostTurnPlan {
  /** 当前回合所属会话。 */
  conversationId: string;
  /** 当前回合所属用户。 */
  userId: string;
  turn: {
    /** 本回合唯一标识。 */
    turnId: string;
    /** 用户消息 ID。 */
    userMessageId: string;
    /** 助手消息 ID。 */
    assistantMessageId: string;
    /** 本回合用户输入。 */
    userInput: string;
    /** 本回合助手输出。 */
    assistantOutput: string;
    /** 回合时间戳。 */
    now: Date;
  };
  context: {
    /** 感知/决策后得到的意图状态快照。 */
    intentState?: DialogueIntentState | null;
    /** 本回合主动作决策，供后处理打点评估。 */
    actionDecision?: ActionDecision;
    /** 本回合认知状态，供成长/观察任务复用。 */
    cognitiveState?: CognitiveTurnState;
    /** 是否仍处于重要议题处理中，影响部分后处理策略。 */
    isImportantIssueInProgress?: boolean;
  };
  /** 返回用户前必须同步完成的任务，例如 capture_work_item。 */
  beforeReturn: PostTurnTask[];
  /** 返回用户后异步执行的任务，不得影响主链路状态。 */
  afterReturn: PostTurnTask[];
  /** 跨任务可变收集器，由 buildPostTurnPlan 初始化 */
  opsCollector: TurnOpsCollector;
}

/** PostTurnUpdatePlan 是 PostTurnPlan 在主链路文档中的语义别名。 */
export type PostTurnUpdatePlan = PostTurnPlan;

export type PostTurnTask =
  | { type: 'capture_work_item' }
  | { type: 'life_record_sync' }
  | { type: 'record_growth' }
  | { type: 'record_emotion_snapshot' }
  | { type: 'interaction_tuning_learning' }
  | { type: 'summarize_trigger'; trigger: 'instant' | 'threshold' | 'flush' }
  | { type: 'auto_evolution_after_summary' } // TODO: not yet implemented — PostTurnPlanBuilder 暂未生产此任务，runner 中也无对应处理分支
  | { type: 'record_cognitive_observation' }
  | { type: 'session_reflection' }
  | { type: 'decision_quality_review' };
