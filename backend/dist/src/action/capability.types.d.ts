import type { DialogueIntentState } from '../assistant/intent/intent.types';
import type { MessageChannel } from '../gateway/message-router.types';
export interface CapabilityRequest {
    conversationId: string;
    turnId: string;
    userInput: string;
    params: Record<string, unknown>;
    intentState?: DialogueIntentState;
}
export interface CapabilityResult {
    success: boolean;
    content: string | null;
    error: string | null;
    meta?: Record<string, unknown>;
}
export interface CapabilityMeta {
    name: string;
    taskIntent: string;
    channels: MessageChannel[];
    description: string;
}
