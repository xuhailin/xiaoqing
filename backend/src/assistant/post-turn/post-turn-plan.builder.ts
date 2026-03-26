import { Injectable } from '@nestjs/common';
import type { ActionDecision } from '../action-reasoner/action-reasoner.types';
import { ClaimEngineConfig } from '../claim-engine/claim-engine.config';
import type { CognitiveTurnState } from '../cognitive-pipeline/cognitive-pipeline.types';
import type { DialogueIntentState } from '../intent/intent.types';
import type { PostTurnPlan } from './post-turn.types';

export type PostTurnExecutionPath = 'chat' | 'tool' | 'missing_params';

@Injectable()
export class PostTurnPlanBuilder {
  constructor(private readonly claimConfig: ClaimEngineConfig) {}

  build(input: {
    executionPath: PostTurnExecutionPath;
    conversationId: string;
    userMsg: { id: string };
    assistantMsg: { id: string; content: string };
    userInput: string;
    intentState?: DialogueIntentState | null;
    actionDecision?: ActionDecision;
    cognitiveState?: CognitiveTurnState;
    isImportantIssueInProgress?: boolean;
  }): PostTurnPlan {
    return {
      conversationId: input.conversationId,
      turn: {
        turnId: input.userMsg.id,
        userMessageId: input.userMsg.id,
        assistantMessageId: input.assistantMsg.id,
        userInput: input.userInput,
        assistantOutput: input.assistantMsg.content,
        now: new Date(),
      },
      context: {
        intentState: input.intentState ?? null,
        actionDecision: input.actionDecision,
        cognitiveState: input.cognitiveState,
        isImportantIssueInProgress: input.isImportantIssueInProgress,
      },
      beforeReturn: this.buildBeforeReturnTasks(input.actionDecision),
      afterReturn: this.buildAfterReturnTasks(input.executionPath, input.userInput),
      opsCollector: { memoryOps: [], claimOps: [], growthOps: [] },
    };
  }

  private buildBeforeReturnTasks(
    actionDecision?: ActionDecision,
  ): PostTurnPlan['beforeReturn'] {
    if (!actionDecision?.workItemPolicy?.shouldCapture || actionDecision.workItemPolicy.kind === 'none') {
      return [];
    }

    return [{ type: 'capture_work_item' }];
  }

  private buildAfterReturnTasks(
    executionPath: PostTurnExecutionPath,
    userInput: string,
  ): PostTurnPlan['afterReturn'] {
    const baseTasks: PostTurnPlan['afterReturn'] = [
      { type: 'life_record_sync' },
      { type: 'record_growth' },
      { type: 'record_emotion_snapshot' },
      ...(this.claimConfig.interactionTuningLearningEnabled
        ? ([{ type: 'interaction_tuning_learning' }] as const)
        : []),
      { type: 'record_cognitive_observation' },
      { type: 'session_reflection' },
      { type: 'decision_quality_review' },
    ];

    if (executionPath === 'missing_params') {
      return baseTasks;
    }

    return [
      ...baseTasks.slice(0, 3),
      { type: 'summarize_trigger', trigger: this.resolveSummarizeTrigger(userInput) },
      ...baseTasks.slice(3),
    ];
  }

  private resolveSummarizeTrigger(userInput: string): 'instant' | 'threshold' {
    return /(?:记住|记一下|别忘|请你记|帮我记|我叫|我姓|我是(?!说|不是|在说)|我今年|我住在|我在(?!说|想|看)|我换了|我的名字)/
      .test(userInput)
      ? 'instant'
      : 'threshold';
  }
}
