import type { Memory } from '@prisma/client';

export interface RecallContext {
  conversationId: string;
  userId: string;
  recentUserMessages: string[];
  maxMid: number;
  maxLong: number;
}

export interface RecallCandidate {
  id: string;
  type: string;
  category: string;
  content: string;
  shortSummary: string | null;
  confidence: number;
  score: number;
  deferred: boolean;
}

export interface RecallResult {
  midMemories: Memory[];
  longMemories: Memory[];
  candidatesCount: number;
}

export interface IMemoryRecaller {
  isReady?(): boolean;
  getStrategyName?(): 'keyword' | 'vector' | 'hybrid';
  recall(ctx: RecallContext): Promise<RecallResult>;
  recallCandidates?(ctx: RecallContext & { minRelevanceScore?: number }): Promise<RecallCandidate[]>;
}

export const MEMORY_RECALLER_TOKEN = 'MEMORY_RECALLER';
