import type { DialogueIntentState } from '../assistant/intent/intent.types';
export declare class TaskFormatterService {
    private readonly contextMessageCap;
    formatTask(userInput: string, intent: DialogueIntentState, recentContext?: Array<{
        role: string;
        content: string;
    }>): string;
    private buildExplicitTaskLine;
}
