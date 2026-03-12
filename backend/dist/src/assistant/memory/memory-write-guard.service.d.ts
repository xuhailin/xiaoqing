import { PrismaService } from '../../infra/prisma.service';
import { type WriteCandidate, type WriteDecisionResult } from './memory-category';
export declare class MemoryWriteGuardService {
    private prisma;
    constructor(prisma: PrismaService);
    evaluate(candidate: WriteCandidate): Promise<WriteDecisionResult>;
    private findConflicting;
    private findSimilar;
}
