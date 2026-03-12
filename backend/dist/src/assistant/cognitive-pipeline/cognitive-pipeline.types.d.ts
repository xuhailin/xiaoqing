import type { DialogueIntentState } from '../intent/intent.types';
import type { WorldState } from '../../infra/world-state/world-state.types';
export type SituationKind = 'casual_chat' | 'emotional_expression' | 'co_thinking' | 'decision_support' | 'advice_request' | 'tool_request' | 'task_execution';
export type UserEmotion = 'calm' | 'happy' | 'low' | 'anxious' | 'irritated' | 'tired' | 'hurt' | 'excited';
export type UserNeedMode = 'companionship' | 'understanding' | 'co_thinking' | 'advice' | 'decision' | 'execution';
export type CognitiveLoadLevel = 'low' | 'medium' | 'high';
export type FragilityLevel = 'low' | 'medium' | 'high';
export interface SituationRecognition {
    kind: SituationKind;
    confidence: number;
    requiresAction: boolean;
    summary: string;
}
export interface UserState {
    emotion: UserEmotion;
    needMode: UserNeedMode;
    cognitiveLoad: CognitiveLoadLevel;
    fragility: FragilityLevel;
    signals: string[];
}
export interface UserModelDelta {
    shouldWriteProfile: boolean;
    shouldWriteCognitive: boolean;
    shouldWriteRelationship: boolean;
    rationale: string[];
}
export interface ResponseStrategy {
    primaryMode: 'empathize' | 'clarify' | 'reflect' | 'advise' | 'decide' | 'execute' | 'companion';
    secondaryMode: 'none' | 'gentle_probe' | 'light_humor' | 'soothe' | 'challenge';
    depth: 'brief' | 'medium' | 'deep';
    initiative: 'passive' | 'balanced' | 'proactive';
    goal: 'stabilize_user' | 'build_understanding' | 'co_think' | 'move_decision' | 'complete_task' | 'stay_connected';
}
export interface JudgementContext {
    style: 'gentle_realism' | 'supportive_clarity' | 'co_thinking';
    shouldChallengeContradiction: boolean;
}
export interface ValueContext {
    priorities: string[];
}
export interface EmotionContext {
    rule: 'stabilize_first' | 'amplify_positive' | 'keep_light' | 'analyze_after_empathy';
    responseOrder: string[];
}
export interface AffinityContext {
    mode: 'steady' | 'warmer' | 'gentle_distance';
    allowLightTease: boolean;
}
export interface RhythmContext {
    pacing: 'short' | 'balanced' | 'expanded';
    shouldAskFollowup: boolean;
    initiative: 'hold' | 'nudge' | 'guide';
}
export interface SafetyFlags {
    capabilityBoundaryRisk: boolean;
    relationalBoundaryRisk: boolean;
    truthBoundaryRisk: boolean;
    notes: string[];
}
export interface RelationshipContext {
    stage: 'early' | 'familiar' | 'steady';
    confidence: number;
    rationale: string[];
}
export interface PersistedGrowthContext {
    cognitiveProfiles: string[];
    judgmentPatterns: string[];
    valuePriorities: string[];
    rhythmPatterns: string[];
    relationshipNotes: string[];
    boundaryNotes: string[];
}
export interface BoundaryPromptContext {
    preflightText: string | null;
}
export interface ClaimSignal {
    type: string;
    key: string;
    value: string;
    confidence: number;
}
export interface SessionStateSignal {
    mood?: string;
    energy?: string;
    focus?: string;
    taskIntent?: string;
    confidence?: number;
}
export interface CognitiveTurnInput {
    userInput: string;
    recentMessages: Array<{
        role: string;
        content: string;
    }>;
    intentState?: DialogueIntentState | null;
    worldState?: WorldState | null;
    growthContext?: PersistedGrowthContext;
    claimSignals?: ClaimSignal[];
    sessionState?: SessionStateSignal | null;
}
export interface CognitiveTurnState {
    phasePlan: {
        phase1: string;
        phase2: string;
        phase3: string;
    };
    situation: SituationRecognition;
    userState: UserState;
    userModelDelta: UserModelDelta;
    responseStrategy: ResponseStrategy;
    judgement: JudgementContext;
    value: ValueContext;
    emotionRule: EmotionContext;
    affinity: AffinityContext;
    rhythm: RhythmContext;
    relationship: RelationshipContext;
    safety: SafetyFlags;
    trace: string[];
}
