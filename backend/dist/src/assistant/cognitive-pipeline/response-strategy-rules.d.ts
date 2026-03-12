import type { FragilityLevel, ResponseStrategy, SituationKind, UserNeedMode, UserState, SituationRecognition } from './cognitive-pipeline.types';
import type { DialogueIntentState } from '../intent/intent.types';
export interface ResponseStrategyRuleConditions {
    requiresTool?: boolean;
    fragility?: FragilityLevel | FragilityLevel[];
    needMode?: UserNeedMode | UserNeedMode[];
    situationKind?: SituationKind | SituationKind[];
}
export interface ResponseStrategyRule {
    priority: number;
    label: string;
    conditions: ResponseStrategyRuleConditions;
    strategy: ResponseStrategy;
}
export declare const RESPONSE_STRATEGY_RULES: ResponseStrategyRule[];
export declare function matchStrategyRule(rule: ResponseStrategyRule, intentState: DialogueIntentState | null | undefined, situation: SituationRecognition, userState: UserState): boolean;
export declare function resolveResponseStrategy(intentState: DialogueIntentState | null | undefined, situation: SituationRecognition, userState: UserState): ResponseStrategy;
