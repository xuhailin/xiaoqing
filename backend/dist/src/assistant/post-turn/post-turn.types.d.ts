import type { DialogueIntentState } from '../intent/intent.types';
import type { CognitiveTurnState } from '../cognitive-pipeline/cognitive-pipeline.types';
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
}
export type PostTurnTask = {
    type: 'daily_moment_suggestion';
} | {
    type: 'record_growth';
} | {
    type: 'summarize_trigger';
    trigger: 'instant' | 'threshold' | 'flush';
} | {
    type: 'auto_evolution_after_summary';
};
