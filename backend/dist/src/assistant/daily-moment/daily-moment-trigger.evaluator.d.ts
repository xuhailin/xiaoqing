import { type DailyMomentChatMessage, type DailyMomentTriggerContext, type DailyMomentTriggerEvaluation } from './daily-moment.types';
export declare class DailyMomentTriggerEvaluator {
    private readonly lowThreshold;
    private readonly highThreshold;
    evaluate(messages: DailyMomentChatMessage[], context: DailyMomentTriggerContext, scoreBias?: number): DailyMomentTriggerEvaluation;
    private resolveSuppression;
    private scoreFun;
    private scoreAtmosphere;
    private scoreCompleteness;
    private scoreCompanionship;
    private scoreInitiative;
    private turnBounce;
    private countHits;
    private inferMoodTag;
}
