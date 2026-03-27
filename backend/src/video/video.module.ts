import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { SeedanceVideoProvider } from './providers/seedance-video.provider';

@Module({
  controllers: [VideoController],
  providers: [VideoService, SeedanceVideoProvider],
  exports: [VideoService],
})
export class VideoModule {}
