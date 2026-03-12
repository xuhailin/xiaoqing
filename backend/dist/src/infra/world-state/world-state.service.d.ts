import { PrismaService } from '../prisma.service';
import type { WorldState, WorldStateUpdate } from './world-state.types';
import type { DialogueIntentState } from '../../assistant/intent/intent.types';
export declare class WorldStateService {
    private prisma;
    constructor(prisma: PrismaService);
    get(conversationId: string): Promise<WorldState | null>;
    update(conversationId: string, update: WorldStateUpdate): Promise<void>;
    mergeSlots(conversationId: string, intent: DialogueIntentState, fallbackWorldState?: Partial<WorldState> | null): Promise<{
        merged: DialogueIntentState;
        filledFromWorldState: string[];
    }>;
    private normalizeRecord;
}
