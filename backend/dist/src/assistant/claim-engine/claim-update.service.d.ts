import { ClaimStoreService } from './claim-store.service';
import type { ClaimDraft, ClaimStatus } from './claim-engine.types';
export declare class ClaimUpdateService {
    private readonly store;
    constructor(store: ClaimStoreService);
    private static readonly DRAFT_CONFIDENCE_CAP;
    private static readonly DRAFT_MAX_STATUS;
    private static readonly DRAFT_MAX_PER_TYPE;
    upsertFromDraft(draft: ClaimDraft): Promise<{
        claimId: string;
        status: ClaimStatus;
    }>;
    private computeConfidence;
    private resolveStatus;
    private clamp01;
}
