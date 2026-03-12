import { type DailyMomentPolicyDecision, type DailyMomentPolicyInput, type DailyMomentSuggestion } from './daily-moment.types';
export declare class DailyMomentPolicy {
    private readonly maxDailySuggestions;
    private readonly maxHourlySuggestions;
    private readonly cooldownMinutes;
    evaluate(input: DailyMomentPolicyInput): DailyMomentPolicyDecision;
    hasRecentSessionTrigger(suggestions: DailyMomentSuggestion[], now: Date, minutes?: number): boolean;
    private computeAdaptiveScoreBias;
    private pickLatest;
    private filterSameDay;
    private dayKey;
}
