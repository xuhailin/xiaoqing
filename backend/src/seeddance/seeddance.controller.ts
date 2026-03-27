import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { SeedanceService } from './seeddance.service';
import { CreateVideoDto } from './dto/create-video.dto';
import type { VideoStatusDto } from './dto/video-status.dto';

@Controller('seeddance')
export class SeedanceController {
  constructor(private readonly seedance: SeedanceService) {}

  @Post('video')
  createVideo(@Body() dto: CreateVideoDto): Promise<{ taskId: string }> {
    return this.seedance.createVideoTask(dto);
  }

  @Get('video/:taskId')
  getStatus(@Param('taskId') taskId: string): Promise<VideoStatusDto> {
    return this.seedance.getTaskStatus(taskId);
  }

  @Sse('video/:taskId/stream')
  streamStatus(@Param('taskId') taskId: string): Observable<MessageEvent> {
    return this.seedance.streamTaskStatus(taskId);
  }

  @Get('config')
  getConfig() {
    return {
      aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      resolutions: ['480p', '720p', '1080p'],
      durationUnits: ['seconds', 'frames'],
      maxCount: 4,
    };
  }
}
