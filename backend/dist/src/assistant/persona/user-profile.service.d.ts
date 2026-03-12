import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';
import { ClaimUpdateService } from '../claim-engine/claim-update.service';
export type UserProfileField = 'preferredVoiceStyle' | 'praisePreference' | 'responseRhythm';
export interface UserProfileDto {
    userKey: string;
    preferredVoiceStyle: string;
    praisePreference: string;
    responseRhythm: string;
    impressionCore: string | null;
    impressionDetail: string | null;
    pendingImpressionCore: string | null;
    pendingImpressionDetail: string | null;
}
export interface ImpressionDelta {
    action: 'replace' | 'append';
    target: 'core' | 'detail';
    content: string;
}
export declare class UserProfileService {
    private prisma;
    private claimUpdater;
    private readonly defaultUserKey;
    private readonly logger;
    constructor(prisma: PrismaService, claimUpdater: ClaimUpdateService, config: ConfigService);
    getOrCreate(userKey?: string): Promise<UserProfileDto>;
    update(data: Partial<Record<UserProfileField, string>> & {
        impressionCore?: string | null;
        impressionDetail?: string | null;
        pendingImpressionCore?: string | null;
        pendingImpressionDetail?: string | null;
    }, userKey?: string): Promise<UserProfileDto>;
    mergeRules(updates: Partial<Record<UserProfileField, string[]>>, userKey?: string): Promise<UserProfileDto>;
    updateImpression(delta: ImpressionDelta & {
        confirmed?: boolean;
    }, userKey?: string): Promise<UserProfileDto>;
    confirmPendingImpression(target: 'core' | 'detail', userKey?: string): Promise<UserProfileDto>;
    rejectPendingImpression(target: 'core' | 'detail', userKey?: string): Promise<UserProfileDto>;
    buildPrompt(dto: UserProfileDto | null | undefined): string;
    private ensureProfileRow;
    private getProfileRow;
    private upsertPreferenceClaimsFromProfileInput;
    private mapRuleToClaim;
    private projectFromClaims;
}
