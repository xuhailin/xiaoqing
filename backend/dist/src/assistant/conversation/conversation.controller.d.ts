import { ConversationService } from './conversation.service';
import type { WorldStateUpdate } from '../../infra/world-state/world-state.types';
export declare class ConversationController {
    private conversation;
    constructor(conversation: ConversationService);
    list(): Promise<{
        id: string;
        title: string | null;
        summarizedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        messageCount: number;
    }[]>;
    create(): Promise<{
        id: string;
    }>;
    getOrCreateCurrent(): Promise<{
        id: string;
    }>;
    getMessages(id: string): Promise<{
        id: string;
        role: string;
        content: string;
        createdAt: Date;
    }[]>;
    listDailyMoments(id: string): Promise<import("../daily-moment/daily-moment.types").DailyMomentRecord[]>;
    getWorldState(id: string): Promise<import("../../infra/world-state/world-state.types").WorldState | null>;
    updateWorldState(id: string, body: WorldStateUpdate): Promise<import("../../infra/world-state/world-state.types").WorldState | null>;
    getTokenStats(id: string): Promise<{
        totalMessages: number;
        userTokens: number;
        assistantTokens: number;
        totalTokens: number;
    }>;
    saveDailyMomentFeedback(id: string, recordId: string, body: {
        feedback: 'like' | 'neutral' | 'awkward' | 'ignored';
    }): Promise<{
        ok: boolean;
    } | {
        error: string;
    }>;
    flushSummarize(id: string): Promise<{
        flushed: boolean;
    }>;
    delete(id: string): Promise<{
        deletedMemories: number;
        growthCleanup: {
            archivedProfiles: number;
            weakenedProfiles: number;
            archivedRelationships: number;
            weakenedRelationships: number;
            deletedBoundaryEvents: number;
            weakenedBoundaryEvents: number;
        };
    }>;
}
