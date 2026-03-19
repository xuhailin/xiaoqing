import { Module } from '@nestjs/common';
import { SharedExperienceModule } from '../shared-experience/shared-experience.module';
import { RelationshipOverviewService } from './relationship-overview.service';
import { RelationshipOverviewController } from './relationship-overview.controller';

@Module({
  imports: [SharedExperienceModule],
  controllers: [RelationshipOverviewController],
  providers: [RelationshipOverviewService],
  exports: [RelationshipOverviewService],
})
export class RelationshipOverviewModule {}
