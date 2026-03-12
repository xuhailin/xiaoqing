import { PrismaService } from '../../infra/prisma.service';
import { type DecayConfig } from './memory-category';
export declare class MemoryDecayService {
    private prisma;
    constructor(prisma: PrismaService);
    calculateDecayScore(lastAccessedAt: Date, hitCount: number, config: DecayConfig, now?: Date): number;
    recalcAll(): Promise<number>;
    getDecayCandidates(): Promise<Array<{
        id: string;
        type: string;
        category: string;
        content: string;
        decayScore: number;
        hitCount: number;
        lastAccessedAt: Date;
    }>>;
    recordHit(memoryId: string): Promise<void>;
    recordHits(memoryIds: string[]): Promise<void>;
    softDelete(memoryId: string): Promise<void>;
    cleanup(memoryIds: string[]): Promise<number>;
}
