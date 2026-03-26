import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IMemoryRecaller } from './memory-recaller.interface';
import { MemoryService } from './memory.service';
import { VectorMemoryRecallerService } from './vector-memory-recaller.service';
import { HybridMemoryRecallerService } from './hybrid-memory-recaller.service';

@Injectable()
export class MemoryRecallerSelectorService {
  private readonly logger = new Logger(MemoryRecallerSelectorService.name);

  select(
    config: ConfigService,
    keywordRecaller: MemoryService,
    vectorRecaller: VectorMemoryRecallerService,
    hybridRecaller: HybridMemoryRecallerService,
  ): IMemoryRecaller {
    const embeddingsEnabled = config.get<string>('FEATURE_EMBEDDINGS') === 'true';
    const hybridEnabled = config.get<string>('FEATURE_HYBRID_RECALL') === 'true';

    if (hybridEnabled) {
      if (hybridRecaller.isReady?.()) {
        this.logger.log('Using hybrid memory recaller');
        return hybridRecaller;
      }
      this.logger.warn('FEATURE_HYBRID_RECALL is on, but hybrid recaller is not ready; falling back to keyword recall');
    }

    if (embeddingsEnabled) {
      if (vectorRecaller.isReady?.()) {
        this.logger.log('Using vector memory recaller');
        return vectorRecaller;
      }
      this.logger.warn('FEATURE_EMBEDDINGS is on, but vector recaller is not ready; falling back to keyword recall');
    }

    this.logger.log('Using keyword memory recaller');
    return keywordRecaller;
  }
}
