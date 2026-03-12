import { SummarizerService } from './summarizer.service';
import { PrismaService } from '../../infra/prisma.service';
import { PersonaService } from '../persona/persona.service';
import { EvolutionSchedulerService } from '../persona/evolution-scheduler.service';
export declare class SummarizerController {
    private summarizer;
    private prisma;
    private persona;
    private evolutionScheduler;
    constructor(summarizer: SummarizerService, prisma: PrismaService, persona: PersonaService, evolutionScheduler: EvolutionSchedulerService);
    summarize(id: string, body?: {
        messageIds?: string[];
    }): Promise<{
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
}
