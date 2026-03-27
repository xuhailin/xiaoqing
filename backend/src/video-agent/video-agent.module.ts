import { Module } from '@nestjs/common';
import { LlmModule } from '../infra/llm/llm.module';
import { VideoModule } from '../video/video.module';
import { CreativePackageService } from './creative-package.service';
import { ShotPlannerService } from './shot-planner.service';
import { VideoAgentController } from './video-agent.controller';
import { VideoAgentService } from './video-agent.service';

@Module({
  imports: [VideoModule, LlmModule],
  controllers: [VideoAgentController],
  providers: [CreativePackageService, ShotPlannerService, VideoAgentService],
})
export class VideoAgentModule {}
