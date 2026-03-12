import { TurnContextAssembler } from './turn-context-assembler.service';
import type { SendMessageResult } from './conversation.service';
import type { TurnContext } from './orchestration.types';
export declare class AssistantOrchestrator {
    private readonly assembler;
    constructor(assembler: TurnContextAssembler);
    processTurn(input: {
        conversationId: string;
        userInput: string;
        userMessage: {
            id: string;
            role: 'user';
            content: string;
            createdAt: Date;
        };
        recentRounds: number;
        execute: (context: TurnContext) => Promise<SendMessageResult>;
    }): Promise<SendMessageResult>;
}
