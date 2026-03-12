import { PrismaService } from '../../infra/prisma.service';
import type { CognitiveTurnState, PersistedGrowthContext } from './cognitive-pipeline.types';
export type GrowthItemType = 'cognitive_profile' | 'relationship_state';
export type GrowthStatus = 'pending' | 'confirmed' | 'rejected';
export interface PendingGrowthItem {
    id: string;
    type: GrowthItemType;
    content: string;
    kind?: string;
    stage?: string;
    status: GrowthStatus;
    sourceMessageIds: string[];
    createdAt: Date;
}
export declare class CognitiveGrowthService {
    private prisma;
    constructor(prisma: PrismaService);
    getGrowthContext(): Promise<PersistedGrowthContext>;
    recordTurnGrowth(turnState: CognitiveTurnState, sourceMessageIds: string[]): Promise<void>;
    getPending(): Promise<PendingGrowthItem[]>;
    confirmGrowth(id: string, type: GrowthItemType): Promise<void>;
    rejectGrowth(id: string, type: GrowthItemType): Promise<void>;
    cleanupGrowthForDeletedMessages(messageIds: string[]): Promise<{
        archivedProfiles: number;
        weakenedProfiles: number;
        archivedRelationships: number;
        weakenedRelationships: number;
        deletedBoundaryEvents: number;
        weakenedBoundaryEvents: number;
    }>;
    private static readonly PROMOTION_THRESHOLDS;
    private checkStagePromotion;
    private writeOrBumpProfile;
    private writeRelationshipState;
    private writeBoundaryEvent;
    private buildCognitiveProfileNote;
    private buildRelationshipNote;
    private buildBoundaryNote;
    private resolveProfileKind;
    private computeNextTrust;
    private computeNextCloseness;
    private toTextArray;
}
