import { PrismaService } from '../../infra/prisma.service';
import type { ClaimDraft, ClaimRecord, ClaimStatus, EvidencePolarity } from './claim-engine.types';
export declare class ClaimStoreService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findByTypeAndKey(userKey: string, type: string, key: string): Promise<ClaimRecord | null>;
    insertCandidate(draft: ClaimDraft): Promise<string>;
    touchExistingClaim(args: {
        claimId: string;
        nextConfidence: number;
        nextStatus: ClaimStatus;
        evidencePolarity: EvidencePolarity;
        messageId?: string;
        sourceModel?: string;
    }): Promise<void>;
    insertEvidence(args: {
        claimId: string;
        userKey: string;
        messageId?: string;
        sessionId?: string;
        snippet: string;
        polarity: EvidencePolarity;
        weight: number;
        sourceModel?: string;
    }): Promise<void>;
    cleanupDraftClaims(args: {
        userKey: string;
        type: string;
        limit: number;
    }): Promise<number>;
    private toTextArray;
    private normalizeEvidenceWeight;
}
