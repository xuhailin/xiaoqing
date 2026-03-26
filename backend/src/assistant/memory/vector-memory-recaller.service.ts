import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { EmbeddingService } from '../../infra/embedding/embedding.service';
import type {
  IMemoryRecaller,
  RecallCandidate,
  RecallContext,
  RecallResult,
} from './memory-recaller.interface';

@Injectable()
export class VectorMemoryRecallerService implements IMemoryRecaller {
  // Phase 8 占位：
  // 真正启用前需要同时满足：
  // 1. Memory schema 存在 embedding 列
  // 2. pgvector 扩展可用
  // 3. EmbeddingService 接通真实模型
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  isReady(): boolean {
    void this.prisma;
    return this.embedding.isReady();
  }

  getStrategyName(): 'vector' {
    return 'vector';
  }

  async recallCandidates(
    ctx: RecallContext & { minRelevanceScore?: number },
  ): Promise<RecallCandidate[]> {
    void ctx;
    throw new Error('Vector recall candidates not ready: Memory.embedding / pgvector / embeddings service missing');
  }

  async recall(ctx: RecallContext): Promise<RecallResult> {
    const queryText = ctx.recentUserMessages.slice(-3).join(' ');
    const queryEmbedding = await this.embedding.embed(queryText);

    if (!queryEmbedding) {
      throw new Error('Embedding not available, use keyword recall');
    }

    void ctx;
    void queryEmbedding;
    void this.prisma;
    throw new Error('Vector recall not ready: Memory.embedding / pgvector / embeddings service missing');
  }
}
