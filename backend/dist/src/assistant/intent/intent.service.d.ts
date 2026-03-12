import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../infra/llm/llm.service';
import { type DialogueIntentState } from './intent.types';
import type { WorldState } from '../../infra/world-state/world-state.types';
export declare class IntentService {
    private llm;
    private readonly contextRounds;
    private readonly perMessageMaxChars;
    constructor(llm: LlmService, config: ConfigService);
    recognize(recentMessages: Array<{
        role: string;
        content: string;
    }>, currentUserInput: string, worldState?: WorldState | null, capabilityPrompt?: string): Promise<DialogueIntentState>;
    private parseIntentState;
    private extractJsonObject;
    private normalize;
    private normalizeIdentityUpdate;
    private normalizeWorldStateUpdate;
    private pickOne;
    private static readonly COORD_REGEX;
    private normalizeSlots;
}
