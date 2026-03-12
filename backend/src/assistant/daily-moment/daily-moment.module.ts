import { Module } from '@nestjs/common';
import { LlmModule } from '../../infra/llm/llm.module';
import { DailyMomentTriggerEvaluator } from './daily-moment-trigger.evaluator';
import { DailyMomentSnippetExtractor } from './daily-moment-snippet.extractor';
import { DailyMomentGenerator } from './daily-moment-generator';
import { DailyMomentPolicy } from './daily-moment-policy';
import { DailyMomentService } from './daily-moment.service';
import { DailyMomentPrismaRepository } from './daily-moment-prisma.repository';

@Module({
  imports: [LlmModule],
  providers: [
    DailyMomentTriggerEvaluator,
    DailyMomentSnippetExtractor,
    DailyMomentGenerator,
    DailyMomentPolicy,
    DailyMomentPrismaRepository,
    DailyMomentService,
  ],
  exports: [DailyMomentService],
})
export class DailyMomentModule {}
