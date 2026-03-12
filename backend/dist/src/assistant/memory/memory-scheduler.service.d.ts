import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';
import { MemoryDecayService } from './memory-decay.service';
export interface PromotionCandidate {
    id: string;
    type: string;
    category: string;
    content: string;
    hitCount: number;
    createdAt: Date;
    direction: 'promote' | 'demote';
    reason: string;
}
export declare class MemorySchedulerService {
    private prisma;
    private decay;
    private readonly enabled;
    private readonly promoteMinHits;
    private readonly promoteMinAgeDays;
    private readonly demoteInactiveDays;
    private readonly logger;
    constructor(prisma: PrismaService, decay: MemoryDecayService, config: ConfigService);
    handleDecayRecalc(): Promise<void>;
    handlePromotionCheck(): Promise<void>;
    getPromotionCandidates(): Promise<PromotionCandidate[]>;
}
