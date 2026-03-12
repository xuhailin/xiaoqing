import { PrismaService } from '../../infra/prisma.service';
import type { SessionStateDraft } from './claim-engine.types';
export declare class SessionStateService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    upsertState(draft: SessionStateDraft): Promise<void>;
    getFreshState(userKey: string, sessionId: string): Promise<{
        stateJson: Record<string, unknown>;
        confidence: number;
    } | null>;
    cleanupExpired(limit?: number): Promise<number>;
}
