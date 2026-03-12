import { Module } from '@nestjs/common';
import { CognitivePipelineService } from './cognitive-pipeline.service';
import { CognitiveGrowthService } from './cognitive-growth.service';
import { BoundaryGovernanceService } from './boundary-governance.service';
import { GrowthController } from './growth.controller';

@Module({
  controllers: [GrowthController],
  providers: [CognitivePipelineService, CognitiveGrowthService, BoundaryGovernanceService],
  exports: [CognitivePipelineService, CognitiveGrowthService, BoundaryGovernanceService],
})
export class CognitivePipelineModule {}
