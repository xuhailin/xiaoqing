import { Injectable } from '@nestjs/common';
import type {
  IMemoryRecaller,
  RecallCandidate,
  RecallContext,
  RecallResult,
} from './memory-recaller.interface';
import { MemoryService } from './memory.service';
import { VectorMemoryRecallerService } from './vector-memory-recaller.service';

@Injectable()
export class HybridMemoryRecallerService implements IMemoryRecaller {
  constructor(
    private readonly keywordRecaller: MemoryService,
    private readonly vectorRecaller: VectorMemoryRecallerService,
  ) {}

  isReady(): boolean {
    void this.keywordRecaller;
    return this.vectorRecaller.isReady();
  }

  getStrategyName(): 'hybrid' {
    return 'hybrid';
  }

  async recall(ctx: RecallContext): Promise<RecallResult> {
    const [keywordResult, vectorResult] = await Promise.allSettled([
      this.keywordRecaller.recall(ctx),
      this.vectorRecaller.recall(ctx),
    ]);

    if (vectorResult.status === 'rejected') {
      if (keywordResult.status === 'fulfilled') {
        return keywordResult.value;
      }
      throw vectorResult.reason;
    }

    const vectorIds = new Set(vectorResult.value.longMemories.map((memory) => memory.id));
    const keywordOnlyLong = keywordResult.status === 'fulfilled'
      ? keywordResult.value.longMemories.filter((memory) => !vectorIds.has(memory.id))
      : [];

    return {
      midMemories: vectorResult.value.midMemories,
      longMemories: [
        ...vectorResult.value.longMemories,
        ...keywordOnlyLong.slice(
          0,
          Math.max(0, ctx.maxLong - vectorResult.value.longMemories.length),
        ),
      ],
      candidatesCount: vectorResult.value.candidatesCount,
    };
  }

  async recallCandidates(
    ctx: RecallContext & { minRelevanceScore?: number },
  ): Promise<RecallCandidate[]> {
    const [keywordResult, vectorResult] = await Promise.allSettled([
      this.keywordRecaller.recallCandidates?.(ctx) ?? Promise.resolve([]),
      this.vectorRecaller.recallCandidates?.(ctx) ?? Promise.resolve([]),
    ]);

    if (vectorResult.status === 'rejected') {
      if (keywordResult.status === 'fulfilled') {
        return keywordResult.value;
      }
      throw vectorResult.reason;
    }

    const vectorIds = new Set(vectorResult.value.map((candidate) => candidate.id));
    const keywordOnly = keywordResult.status === 'fulfilled'
      ? keywordResult.value.filter((candidate) => !vectorIds.has(candidate.id))
      : [];

    return [...vectorResult.value, ...keywordOnly];
  }
}
