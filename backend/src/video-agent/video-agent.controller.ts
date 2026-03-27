import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Sse,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { UserId } from '../infra/user-id.decorator';
import type { CreateCreativePackageDto } from './dto/create-creative-package.dto';
import type { CreateVideoProjectDto } from './dto/create-video-project.dto';
import type { PlanVideoScenesDto } from './dto/plan-video-scenes.dto';
import type { UpdateCreativePackageDto } from './dto/update-creative-package.dto';
import { CreativePackageService } from './creative-package.service';
import { VideoAgentService } from './video-agent.service';

@Controller('video-agent')
export class VideoAgentController {
  constructor(
    private readonly videoAgentService: VideoAgentService,
    private readonly creativePackageService: CreativePackageService,
  ) {}

  @Get('packages')
  listPackages() {
    return this.creativePackageService.findAll();
  }

  @Get('packages/:id')
  getPackage(@Param('id') id: string) {
    return this.creativePackageService.findOne(id);
  }

  @Post('packages')
  createPackage(@Body() dto: CreateCreativePackageDto) {
    return this.creativePackageService.create(dto);
  }

  @Put('packages/:id')
  updatePackage(@Param('id') id: string, @Body() dto: UpdateCreativePackageDto) {
    return this.creativePackageService.update(id, dto);
  }

  @Delete('packages/:id')
  deletePackage(@Param('id') id: string) {
    return this.creativePackageService.remove(id);
  }

  @Post('projects')
  createProject(@Body() dto: CreateVideoProjectDto, @UserId() userId: string) {
    return this.videoAgentService.createAndExecuteProject(dto, userId);
  }

  @Post('plans/scenes')
  planScenes(@Body() dto: PlanVideoScenesDto) {
    return this.videoAgentService.planScenes(dto);
  }

  @Get('projects')
  listProjects(@UserId() userId: string) {
    return this.videoAgentService.listProjects(userId);
  }

  @Get('projects/:id')
  getProject(@Param('id') id: string, @UserId() userId: string) {
    return this.videoAgentService.getProject(id, userId);
  }

  @Sse('projects/:id/stream')
  streamProject(@Param('id') id: string, @UserId() userId: string): Observable<MessageEvent> {
    return this.videoAgentService.streamProject(id, userId);
  }
}
