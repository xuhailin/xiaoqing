import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { UserId } from '../infra/user-id.decorator';
import { CreateVideoTaskDto } from './dto/create-video-task.dto';
import { VideoService } from './video.service';

@Controller('videos')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('tasks')
  createTask(@Body() body: CreateVideoTaskDto, @UserId() userId?: string) {
    return this.videoService.createTask(body, userId ?? 'default-user');
  }

  @Get('tasks')
  listTasks(
    @UserId() userId?: string,
    @Query('status') status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    @Query('limit') limit?: string,
  ) {
    return this.videoService.listTasks(userId ?? 'default-user', {
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('tasks/:taskId')
  getTask(@Param('taskId') taskId: string, @UserId() userId?: string) {
    return this.videoService.getTask(taskId, userId ?? 'default-user');
  }

  @Sse('tasks/:taskId/stream')
  streamTask(
    @Param('taskId') taskId: string,
    @UserId() userId?: string,
  ): Observable<MessageEvent> {
    return this.videoService.streamTask(taskId, userId ?? 'default-user');
  }

  @Post('tasks/:taskId/cancel')
  cancelTask(@Param('taskId') taskId: string, @UserId() userId?: string) {
    return this.videoService.cancelTask(taskId, userId ?? 'default-user');
  }

  @Get('config')
  getConfig() {
    return this.videoService.getConfig();
  }
}
