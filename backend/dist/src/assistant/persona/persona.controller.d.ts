import { PrismaService } from '../../infra/prisma.service';
import { PersonaService, type EvolutionChange, type EvolutionPreview } from './persona.service';
import { EvolutionSchedulerService } from './evolution-scheduler.service';
import { UserProfileService, type UserProfileDto } from './user-profile.service';
export declare class PersonaController {
    private persona;
    private prisma;
    private evolutionScheduler;
    private userProfile;
    constructor(persona: PersonaService, prisma: PrismaService, evolutionScheduler: EvolutionSchedulerService, userProfile: UserProfileService);
    get(): Promise<import("./persona.service").PersonaDto>;
    getOptions(): {
        fieldLabels: Record<import("./persona.service").PersonaField, string>;
    };
    getProfile(): Promise<UserProfileDto>;
    updateProfile(body: {
        preferredVoiceStyle?: string;
        praisePreference?: string;
        responseRhythm?: string;
        impressionCore?: string | null;
        impressionDetail?: string | null;
        pendingImpressionCore?: string | null;
        pendingImpressionDetail?: string | null;
    }): Promise<UserProfileDto>;
    update(body: {
        identity?: string;
        personality?: string;
        valueBoundary?: string;
        behaviorForbidden?: string;
        voiceStyle?: string;
        adaptiveRules?: string;
        silencePermission?: string;
        metaFilterPolicy?: string;
        evolutionAllowed?: string;
        evolutionForbidden?: string;
    }): Promise<import("./persona.service").PersonaDto>;
    suggestEvolution(body: {
        conversationId: string;
    }): Promise<{
        changes: EvolutionChange[];
    }>;
    confirmEvolution(body: {
        changes: EvolutionChange[];
    }): Promise<{
        accepted: boolean;
        reason?: string;
        persona?: import("./persona.service").PersonaDto;
    } | {
        error: string;
    }>;
    previewEvolution(body: {
        changes: EvolutionChange[];
    }): Promise<{
        accepted: boolean;
        reason?: string;
        preview?: EvolutionPreview;
    } | {
        error: string;
    }>;
    updateImpression(body: {
        action: 'replace' | 'append';
        target: 'core' | 'detail';
        content: string;
    }): Promise<UserProfileDto | {
        error: string;
    }>;
    confirmImpression(body: {
        target: 'core' | 'detail';
    }): Promise<UserProfileDto | {
        error: string;
    }>;
    rejectImpression(body: {
        target: 'core' | 'detail';
    }): Promise<UserProfileDto | {
        error: string;
    }>;
    getPendingEvolution(): import("./evolution-scheduler.service").PendingEvolutionSuggestion | null;
    clearPendingEvolution(): {
        ok: boolean;
    };
}
