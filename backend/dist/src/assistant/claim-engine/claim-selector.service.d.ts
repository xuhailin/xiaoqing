import { PrismaService } from '../../infra/prisma.service';
export declare class ClaimSelectorService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getInjectableClaims(userKey: string, byTypeBudget: Partial<Record<string, number>>, opts?: {
        typePriority?: string[];
    }): Promise<Array<{
        type: string;
        key: string;
        valueJson: unknown;
        confidence: number;
        status: string;
    }>>;
    getDraftClaimsForDebug(userKey: string, opts?: {
        perTypeLimit?: number;
        totalLimit?: number;
    }): Promise<Array<{
        type: string;
        key: string;
        valueJson: unknown;
        confidence: number;
        status: string;
    }>>;
}
