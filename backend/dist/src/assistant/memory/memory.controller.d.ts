import { MemoryService } from './memory.service';
import { MemoryDecayService } from './memory-decay.service';
export declare class MemoryController {
    private memory;
    private decay;
    constructor(memory: MemoryService, decay: MemoryDecayService);
    forInjection(midK?: string): Promise<{
        id: string;
        type: string;
        content: string;
    }[]>;
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
    update(id: string, body: {
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
    recalculateDecay(): Promise<{
        updated: number;
    }>;
    getDecayCandidates(): Promise<{
        id: string;
        type: string;
        category: string;
        content: string;
        decayScore: number;
        hitCount: number;
        lastAccessedAt: Date;
    }[]>;
    cleanupDecayed(body: {
        memoryIds: string[];
    }): Promise<{
        deleted: number;
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
}
