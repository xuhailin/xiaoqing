import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';
import { PersonaService, EvolutionChange } from './persona.service';
export interface PendingEvolutionSuggestion {
    changes: EvolutionChange[];
    triggerReason: string;
    createdAt: Date;
}
export declare class EvolutionSchedulerService {
    private prisma;
    private persona;
    private readonly enabled;
    private readonly densityThreshold;
    private readonly logger;
    private pendingSuggestion;
    constructor(prisma: PrismaService, persona: PersonaService, config: ConfigService);
    getPendingSuggestion(): PendingEvolutionSuggestion | null;
    setPendingSuggestion(suggestion: PendingEvolutionSuggestion): void;
    clearPendingSuggestion(): void;
    handleDensityCheck(): Promise<void>;
}
