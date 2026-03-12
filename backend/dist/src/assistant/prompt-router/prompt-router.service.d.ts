import type { OpenAI } from 'openai';
import { LlmService } from '../../infra/llm/llm.service';
import type { MemoryCandidate } from '../memory/memory.service';
import type { DialogueIntentState } from '../intent/intent.types';
import type { WorldState } from '../../infra/world-state/world-state.types';
import type { ExpressionFields } from '../persona/persona.service';
import type { BoundaryPromptContext, CognitiveTurnState, PersistedGrowthContext } from '../cognitive-pipeline/cognitive-pipeline.types';
export declare const CHAT_PROMPT_VERSION = "chat_v6";
export declare const SUMMARY_PROMPT_VERSION = "summary_v2";
export declare const MEMORY_ANALYSIS_PROMPT_VERSION = "memory_analysis_v1";
export declare const RANK_PROMPT_VERSION = "rank_v1";
export declare const TOOL_WRAP_PROMPT_VERSION = "tool_wrap_v1";
export type RouterMode = 'chat' | 'summary';
export interface ChatContext {
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    personaPrompt?: string;
    expressionFields?: ExpressionFields;
    metaFilterPolicy?: string | null;
    userProfileText?: string | null;
    memories?: Array<{
        id: string;
        type: string;
        content: string;
    }>;
    identityAnchor?: string | null;
    intentState?: DialogueIntentState;
    worldState?: WorldState | null;
    cognitiveState?: CognitiveTurnState;
    growthContext?: PersistedGrowthContext;
    boundaryPrompt?: BoundaryPromptContext | null;
    claimPolicyText?: string | null;
    sessionStateText?: string | null;
}
export interface SummaryContext {
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    messageIds: string[];
}
export interface ExistingCognitiveMemory {
    id: string;
    content: string;
}
export interface ToolResultContext {
    personaText: string;
    expressionText?: string;
    userProfileText?: string;
    metaFilterPolicy?: string | null;
    toolKind?: 'weather' | 'book_download' | 'general_action' | 'timesheet' | 'openclaw';
    userInput: string;
    toolResult: string | null;
    toolError: string | null;
    recentMessages?: {
        role: string;
        content: string;
    }[];
}
export declare class PromptRouterService {
    private llm;
    constructor(llm: LlmService);
    buildChatMessages(ctx: ChatContext): OpenAI.Chat.ChatCompletionMessageParam[];
    buildCognitivePolicy(state?: CognitiveTurnState): string;
    buildGrowthPolicy(growth?: PersistedGrowthContext): string;
    buildPersonaPresenceAnchor(fields?: ExpressionFields): string;
    buildBoundaryPolicy(boundary?: BoundaryPromptContext | null): string;
    buildMetaFilterPolicy(policy?: string | null): string;
    buildExpressionPolicy(fields?: ExpressionFields, intentState?: DialogueIntentState): string;
    private getAdaptiveHint;
    private uniqueLines;
    private extractRuleLines;
    rankMemoriesByRelevance(ctx: {
        recentMessages: Array<{
            role: string;
            content: string;
        }>;
        candidates: MemoryCandidate[];
        tokenBudget: number;
    }): Promise<{
        rankedIds: string[];
        needDetail: boolean;
    }>;
    selectMemoriesForInjection(rankedCandidates: MemoryCandidate[], tokenBudget: number, contentMaxChars?: number, useShortSummary?: boolean): Array<{
        id: string;
        type: string;
        content: string;
    }>;
    buildSummaryMessages(ctx: SummaryContext & {
        personaText?: string;
    }): OpenAI.Chat.ChatCompletionMessageParam[];
    buildMemoryAnalysisMessages(ctx: SummaryContext & {
        existingCognitive?: ExistingCognitiveMemory[];
    }): OpenAI.Chat.ChatCompletionMessageParam[];
    buildToolResultMessages(ctx: ToolResultContext): OpenAI.Chat.ChatCompletionMessageParam[];
}
