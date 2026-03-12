import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';
import { LlmService } from '../../infra/llm/llm.service';
import { PromptRouterService } from '../prompt-router/prompt-router.service';
import { MemoryService } from '../memory/memory.service';
import { MemoryWriteGuardService } from '../memory/memory-write-guard.service';
import { UserProfileService } from '../persona/user-profile.service';
import { IdentityAnchorService } from '../identity-anchor/identity-anchor.service';
import { ClaimEngineConfig } from '../claim-engine/claim-engine.config';
import { ClaimUpdateService } from '../claim-engine/claim-update.service';
import { SessionStateService } from '../claim-engine/session-state.service';
export declare class SummarizerService {
    private prisma;
    private llm;
    private router;
    private memory;
    private writeGuard;
    private userProfile;
    private anchor;
    private claimConfig;
    private claimUpdater;
    private sessionState;
    private readonly featureAutoImpression;
    private readonly featureAutoAnchor;
    private readonly featureImpressionRequireConfirm;
    private readonly logger;
    constructor(prisma: PrismaService, llm: LlmService, router: PromptRouterService, memory: MemoryService, writeGuard: MemoryWriteGuardService, userProfile: UserProfileService, anchor: IdentityAnchorService, claimConfig: ClaimEngineConfig, claimUpdater: ClaimUpdateService, sessionState: SessionStateService, config: ConfigService);
    summarize(conversationId: string, messageIds?: string[]): Promise<{
        created: number;
        memories: Array<{
            id: string;
            type: string;
            category: string;
            content: string;
        }>;
        merged: number;
        overwritten: number;
        skipped: number;
        personaSuggestion?: string;
        doNotStore?: string[];
        confidenceBumps?: Array<{
            memoryId: string;
            newConfidence: number;
        }>;
        claimWriteReport?: {
            attempted: number;
            written: number;
            rejected: number;
            rejectedSamples?: Array<{
                type: string;
                key?: string;
                reason: string;
            }>;
        };
        pendingCanonicalSuggestions?: Array<{
            type: string;
            key: string;
            confidence: number;
            evidenceCount: number;
            counterEvidenceCount: number;
            createdAt: Date;
            updatedAt: Date;
            lastSeenAt: Date;
        }>;
    }>;
    private extractAndUpdateImpression;
    private parseImpressionJson;
    private extractAndUpdateAnchor;
    private parseAnchorJson;
    private parseMemoryAnalysisJson;
    private normalizePolarity;
    private mapLegacyTypeToClaimType;
    private writeClaimDraft;
    private writeSessionStateIfPresent;
    private buildDraftKey;
    private getDraftPrefix;
}
