import type { CognitiveTurnInput, CognitiveTurnState } from './cognitive-pipeline.types';
export declare class CognitivePipelineService {
    analyzeTurn(input: CognitiveTurnInput): CognitiveTurnState;
    private recognizeSituation;
    private static readonly EMOTION_META;
    private detectUserState;
    private estimateRelationship;
    private planResponseStrategy;
    private buildJudgementContext;
    private buildValueContext;
    private buildEmotionContext;
    private buildAffinityContext;
    private buildRhythmContext;
    private buildSafetyFlags;
    private buildUserModelDelta;
    private getSituationSummary;
    private matchesAny;
    private applyPolicySignals;
    private isKnownEmotion;
}
