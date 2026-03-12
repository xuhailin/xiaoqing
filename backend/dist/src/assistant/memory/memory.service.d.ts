import { PrismaService } from '../../infra/prisma.service';
export interface MemoryCandidate {
    id: string;
    type: string;
    category: string;
    content: string;
    shortSummary: string | null;
    confidence: number;
    score: number;
    deferred: boolean;
}
export declare class MemoryService {
    private prisma;
    constructor(prisma: PrismaService);
    list(type?: 'mid' | 'long', category?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        confidence: number;
        content: string;
        category: string;
        shortSummary: string | null;
        sourceMessageIds: string[];
        hitCount: number;
        lastAccessedAt: Date;
        decayScore: number;
        frozen: boolean;
        correctedMemoryId: string | null;
    }[]>;
    getOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        confidence: number;
        content: string;
        category: string;
        shortSummary: string | null;
        sourceMessageIds: string[];
        hitCount: number;
        lastAccessedAt: Date;
        decayScore: number;
        frozen: boolean;
        correctedMemoryId: string | null;
    } | null>;
    update(id: string, data: {
        content?: string;
        confidence?: number;
        sourceMessageIds?: string[];
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        confidence: number;
        content: string;
        category: string;
        shortSummary: string | null;
        sourceMessageIds: string[];
        hitCount: number;
        lastAccessedAt: Date;
        decayScore: number;
        frozen: boolean;
        correctedMemoryId: string | null;
    }>;
    deleteOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        confidence: number;
        content: string;
        category: string;
        shortSummary: string | null;
        sourceMessageIds: string[];
        hitCount: number;
        lastAccessedAt: Date;
        decayScore: number;
        frozen: boolean;
        correctedMemoryId: string | null;
    }>;
    create(data: {
        type: 'mid' | 'long';
        content: string;
        sourceMessageIds: string[];
        confidence?: number;
        category?: string;
        frozen?: boolean;
        correctedMemoryId?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        confidence: number;
        content: string;
        category: string;
        shortSummary: string | null;
        sourceMessageIds: string[];
        hitCount: number;
        lastAccessedAt: Date;
        decayScore: number;
        frozen: boolean;
        correctedMemoryId: string | null;
    }>;
    getExistingCognitiveMemories(): Promise<Array<{
        id: string;
        content: string;
    }>>;
    findByCategory(category: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        confidence: number;
        content: string;
        category: string;
        shortSummary: string | null;
        sourceMessageIds: string[];
        hitCount: number;
        lastAccessedAt: Date;
        decayScore: number;
        frozen: boolean;
        correctedMemoryId: string | null;
    }[]>;
    bumpConfidence(id: string, delta: number): Promise<{
        id: string;
        confidence: number;
    } | null>;
    mergeInto(targetId: string, additionalContent: string, newSourceMessageIds: string[]): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        confidence: number;
        content: string;
        category: string;
        shortSummary: string | null;
        sourceMessageIds: string[];
        hitCount: number;
        lastAccessedAt: Date;
        decayScore: number;
        frozen: boolean;
        correctedMemoryId: string | null;
    } | null>;
    private extractKeywords;
    private keywordOverlapScore;
    getCandidatesForRecall(opts: {
        recentMessages: Array<{
            role: string;
            content: string;
        }>;
        maxLong?: number;
        maxMid?: number;
        minRelevanceScore?: number;
    }): Promise<MemoryCandidate[]>;
    getRelatedMemories(recalledIds: string[], maxRelated?: number): Promise<MemoryCandidate[]>;
    getForInjection(midK: number): Promise<Array<{
        id: string;
        type: string;
        content: string;
    }>>;
}
