import type { CognitiveTurnState } from './cognitive-pipeline.types';
export interface BoundaryPreflight {
    shouldRestrictInitiative: boolean;
    forceSoftenTone: boolean;
    disallowCapabilityClaims: boolean;
    notes: string[];
}
export interface BoundaryReviewResult {
    content: string;
    adjusted: boolean;
    reasons: string[];
}
export type ReviewRuleCondition = 'truth_risk' | 'fragility_high' | 'capability_risk' | 'relational_risk';
export interface ReviewRule {
    condition: ReviewRuleCondition;
    pattern: string;
    replacement: string;
    label: string;
}
export declare class BoundaryGovernanceService {
    private rules;
    setCustomRules(rules: ReviewRule[]): void;
    addRules(rules: ReviewRule[]): void;
    resetRules(): void;
    getRules(): ReviewRule[];
    buildPreflight(turnState: CognitiveTurnState): BoundaryPreflight;
    buildPreflightPrompt(preflight: BoundaryPreflight): string;
    reviewGeneratedReply(content: string, turnState: CognitiveTurnState, opts?: {
        toolWasActuallyUsed?: boolean;
    }): BoundaryReviewResult;
    private shouldApplyRule;
}
