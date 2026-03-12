import type { PersonaDto, ExpressionFields } from '../persona/persona.service';
import type { UserProfileDto } from '../persona/user-profile.service';
import type { AnchorDto } from '../identity-anchor/identity-anchor.service';
import type { BoundaryPromptContext, ClaimSignal, CognitiveTurnState, PersistedGrowthContext, SessionStateSignal } from '../cognitive-pipeline/cognitive-pipeline.types';
import type { DialogueIntentState } from '../intent/intent.types';
import type { WorldState } from '../../infra/world-state/world-state.types';
export interface MemoryRecallPlan {
    candidatesCount: number;
    selectedCount: number;
    needDetail: boolean;
}
export interface TurnContext {
    request: {
        conversationId: string;
        now: Date;
        userInput: string;
        userMessage: {
            id: string;
            role: 'user';
            content: string;
            createdAt: Date;
        };
    };
    conversation: {
        recentMessages: Array<{
            role: string;
            content: string;
        }>;
    };
    persona: {
        personaDto: PersonaDto;
        expressionFields: ExpressionFields;
        metaFilterPolicy: string | null;
    };
    user: {
        userProfile: UserProfileDto;
        identityAnchors: AnchorDto[];
        anchorText: string | null;
        anchorCity?: string;
    };
    world: {
        storedWorldState: WorldState | null;
        defaultWorldState: WorldState | null;
    };
    growth: {
        growthContext: PersistedGrowthContext;
    };
    claims: {
        claimSignals: ClaimSignal[];
        claimPolicyText: string;
        sessionState: SessionStateSignal | null;
        sessionStateText: string;
        injectedClaimsDebug: Array<{
            type: string;
            key: string;
            confidence: number;
            status: string;
        }>;
        draftClaimsDebug: Array<{
            type: string;
            key: string;
            confidence: number;
            status: string;
        }>;
    };
    runtime: {
        intentState?: DialogueIntentState | null;
        mergedIntentState?: DialogueIntentState | null;
        memoryRecall?: MemoryRecallPlan;
        cognitiveState?: CognitiveTurnState;
        boundaryPrompt?: BoundaryPromptContext | null;
    };
}
export type TurnDecision = {
    kind: 'daily_moment_entry';
    reason: string;
    triggerMode: 'manual' | 'accept_suggestion';
    acceptedSuggestionId?: string;
} | {
    kind: 'chat';
    reason: string;
    intentState?: DialogueIntentState | null;
} | {
    kind: 'ask_missing';
    reason: string;
    intentState: DialogueIntentState;
    missingParams: string[];
} | {
    kind: 'tool';
    reason: string;
    intentState: DialogueIntentState;
    toolRoute: 'local_weather' | 'local_book_download' | 'local_general_action' | 'openclaw';
};
