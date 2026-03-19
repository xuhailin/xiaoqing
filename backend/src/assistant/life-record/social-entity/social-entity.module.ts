import { Module } from '@nestjs/common';
import { LlmModule } from '../../../infra/llm/llm.module';
import { SocialEntityClassifierSchedulerService } from './social-entity-classifier-scheduler.service';
import { SocialEntityClassifierService } from './social-entity-classifier.service';
import { SocialEntityService } from './social-entity.service';
import { SocialEntityController } from './social-entity.controller';

@Module({
  imports: [LlmModule],
  controllers: [SocialEntityController],
  providers: [SocialEntityService, SocialEntityClassifierService, SocialEntityClassifierSchedulerService],
  exports: [SocialEntityService, SocialEntityClassifierService],
})
export class SocialEntityModule {}
