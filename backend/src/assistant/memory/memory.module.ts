import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { MemoryDecayService } from './memory-decay.service';
import { MemoryWriteGuardService } from './memory-write-guard.service';
import { MemorySchedulerService } from './memory-scheduler.service';
import { EmotionHistoryService } from './emotion-history.service';
import { EmbeddingService } from '../../infra/embedding/embedding.service';
import { VectorMemoryRecallerService } from './vector-memory-recaller.service';
import { HybridMemoryRecallerService } from './hybrid-memory-recaller.service';
import { MEMORY_RECALLER_TOKEN } from './memory-recaller.interface';
import { MemoryRecallerSelectorService } from './memory-recaller-selector.service';
import { LlmModule } from '../../infra/llm/llm.module';

@Module({
  imports: [ConfigModule, LlmModule],
  controllers: [MemoryController],
  providers: [
    MemoryService,
    MemoryDecayService,
    MemoryWriteGuardService,
    MemorySchedulerService,
    EmotionHistoryService,
    EmbeddingService,
    VectorMemoryRecallerService,
    HybridMemoryRecallerService,
    MemoryRecallerSelectorService,
    {
      provide: MEMORY_RECALLER_TOKEN,
      useFactory: (
        selector: MemoryRecallerSelectorService,
        config: ConfigService,
        keywordRecaller: MemoryService,
        vectorRecaller: VectorMemoryRecallerService,
        hybridRecaller: HybridMemoryRecallerService,
      ) => selector.select(config, keywordRecaller, vectorRecaller, hybridRecaller),
      inject: [
        MemoryRecallerSelectorService,
        ConfigService,
        MemoryService,
        VectorMemoryRecallerService,
        HybridMemoryRecallerService,
      ],
    },
  ],
  exports: [
    MemoryService,
    MemoryDecayService,
    MemoryWriteGuardService,
    MemorySchedulerService,
    EmotionHistoryService,
    EmbeddingService,
    VectorMemoryRecallerService,
    HybridMemoryRecallerService,
    MemoryRecallerSelectorService,
    MEMORY_RECALLER_TOKEN,
  ],
})
export class MemoryModule {}
