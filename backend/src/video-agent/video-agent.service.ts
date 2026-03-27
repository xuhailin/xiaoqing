import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { VideoShotStatus, VideoTaskStatus, type CreativePackage, type VideoProject, type VideoTask, type VideoShot } from '@prisma/client';
import type { Observable } from 'rxjs';
import {
  EMPTY,
  Observable as RxObservable,
  Subject,
  distinctUntilChanged,
  from,
  interval,
  map,
  merge,
  startWith,
  switchMap,
  takeWhile,
} from 'rxjs';
import { PrismaService } from '../infra/prisma.service';
import { VideoService } from '../video/video.service';
import { buildFinalPrompt } from './prompts/shot-planner.prompt';
import type { CreateVideoProjectDto } from './dto/create-video-project.dto';
import type { PlanVideoScenesDto } from './dto/plan-video-scenes.dto';
import { CreativePackageService } from './creative-package.service';
import { ShotPlannerService } from './shot-planner.service';
import type {
  CreativePackageDto,
  PlannedShot,
  StoryboardSceneInput,
  VideoAgentEvent,
  VideoProjectDto,
  VideoShotDto,
} from './video-agent.types';

type ProjectWithRelations = VideoProject & {
  package: CreativePackage;
  shots: Array<VideoShot & { videoTask: VideoTask | null }>;
};
type ProjectStateEvent = Extract<VideoAgentEvent, { type: 'project_state' }>;

const PROJECT_STREAM_POLL_MS = 4_000;
const MAX_ACTIVE_SHOT_GENERATIONS = 2;

@Injectable()
export class VideoAgentService {
  private readonly logger = new Logger(VideoAgentService.name);
  private readonly streams = new Map<string, Subject<VideoAgentEvent>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly videoService: VideoService,
    private readonly creativePackageService: CreativePackageService,
    private readonly shotPlanner: ShotPlannerService,
  ) {}

  async createAndExecuteProject(
    dto: CreateVideoProjectDto,
    userId: string,
  ): Promise<VideoProjectDto> {
    const creativePackage = await this.creativePackageService.findOne(dto.packageId);
    const project = await this.prisma.videoProject.create({
      data: {
        userId,
        packageId: dto.packageId,
        storyBrief: dto.storyBrief?.trim() || undefined,
      },
      include: {
        package: true,
        shots: {
          include: { videoTask: true },
          orderBy: { shotIndex: 'asc' },
        },
      },
    });

    const stream = new Subject<VideoAgentEvent>();
    this.streams.set(project.id, stream);

    void this.executeProject(
      project.id,
      creativePackage,
      dto.storyBrief?.trim(),
      dto.scenes ?? [],
      userId,
      stream,
    ).catch((error: unknown) => {
      this.logger.error(
        `video project ${project.id} execution failed`,
        error instanceof Error ? error.stack : String(error),
      );
    });

    return this.toProjectDto(project);
  }

  async planScenes(dto: PlanVideoScenesDto): Promise<StoryboardSceneInput[]> {
    const creativePackage = await this.creativePackageService.findOne(dto.packageId);
    const plannedShots = await this.shotPlanner.planShots(creativePackage, dto.storyBrief?.trim());
    return plannedShots.map((shot) => ({
      prompt: shot.description,
      duration: shot.duration,
      description: shot.description,
      cameraMovement: shot.cameraMovement,
    }));
  }

  async getProject(projectId: string, userId: string): Promise<VideoProjectDto> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id: projectId, userId },
      include: {
        package: true,
        shots: {
          include: { videoTask: true },
          orderBy: { shotIndex: 'asc' },
        },
      },
    });
    if (!project) {
      throw new NotFoundException(`video project ${projectId} not found`);
    }
    return this.toProjectDto(project);
  }

  async listProjects(userId: string): Promise<VideoProjectDto[]> {
    const projects = await this.prisma.videoProject.findMany({
      where: { userId },
      include: {
        package: true,
        shots: {
          include: { videoTask: true },
          orderBy: { shotIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return projects.map((project) => this.toProjectDto(project));
  }

  streamProject(projectId: string, userId: string): Observable<MessageEvent> {
    return from(this.assertProjectAccess(projectId, userId)).pipe(
      switchMap(() =>
        merge(this.createLiveEventStream(projectId), this.createProjectStateStream(projectId, userId)),
      ),
      map((event) => ({ data: JSON.stringify(event) }) satisfies MessageEvent),
    );
  }

  private async executeProject(
    projectId: string,
    creativePackage: CreativePackageDto,
    storyBrief: string | undefined,
    providedScenes: StoryboardSceneInput[],
    userId: string,
    stream: Subject<VideoAgentEvent>,
  ): Promise<void> {
    try {
      stream.next({ type: 'planning', message: '正在规划分镜...' });
      const plannedShots = await this.resolvePlannedShots(
        creativePackage,
        storyBrief,
        providedScenes,
      );
      const createdShots = await Promise.all(
        plannedShots.map((plannedShot) =>
          this.prisma.videoShot.create({
            data: {
              projectId,
              shotIndex: plannedShot.shotIndex,
              description: plannedShot.description,
              cameraMovement: plannedShot.cameraMovement,
              finalPrompt: buildFinalPrompt({
                shotDescription: plannedShot.description,
                appearancePrompts: creativePackage.characters.map(
                  (character) => character.appearancePrompt,
                ),
                colorTone: creativePackage.worldStyle.colorTone,
                atmosphere: creativePackage.worldStyle.atmosphere,
                aspectRatio: creativePackage.stylePreset.aspectRatio,
              }),
              duration: plannedShot.duration || creativePackage.stylePreset.duration,
              aspectRatio: creativePackage.stylePreset.aspectRatio,
              resolution: creativePackage.stylePreset.resolution,
            },
          }),
        ),
      );

      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          status: 'generating',
          startedAt: new Date(),
          errorMessage: null,
        },
      });

      stream.next({
        type: 'planning',
        message: `已规划 ${createdShots.length} 个分镜，开始生成...`,
      });

      createdShots.forEach((shot) => {
        stream.next({
          type: 'shot_queued',
          shotIndex: shot.shotIndex,
          total: createdShots.length,
        });
      });

      await this.generateShotsWithConcurrency(projectId, createdShots, userId, stream);

      const finalShots = await this.prisma.videoShot.findMany({
        where: { projectId },
      });
      const allDone = finalShots.length > 0 && finalShots.every((shot) => shot.status === VideoShotStatus.done);

      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          status: allDone ? 'done' : 'failed',
          completedAt: allDone ? new Date() : null,
          failedAt: allDone ? null : new Date(),
          errorMessage: allDone ? null : '部分分镜生成失败',
        },
      });

      if (allDone) {
        stream.next({ type: 'project_done', projectId });
      } else {
        stream.next({ type: 'project_failed', error: '部分分镜生成失败' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          status: 'failed',
          failedAt: new Date(),
          errorMessage: message,
        },
      });
      stream.next({ type: 'project_failed', error: message });
      this.logger.error(`video project ${projectId} failed: ${message}`);
    } finally {
      stream.complete();
      this.streams.delete(projectId);
    }
  }

  private async generateShot(
    projectId: string,
    shotId: string,
    shotIndex: number,
    userId: string,
    stream: Subject<VideoAgentEvent>,
  ): Promise<void> {
    const shot = await this.prisma.videoShot.findUnique({
      where: { id: shotId },
    });
    if (!shot?.finalPrompt) {
      throw new NotFoundException(`video shot ${shotId} not found`);
    }

    try {
      const task = await this.videoService.createTask(
        {
          prompt: shot.finalPrompt,
          aspectRatio: shot.aspectRatio ?? '16:9',
          resolution: shot.resolution ?? '720p',
          duration: shot.duration ?? 5,
          durationUnit: 'seconds',
        },
        userId,
      );

      await this.prisma.videoShot.update({
        where: { id: shotId },
        data: {
          videoTaskId: task.taskId,
          status: 'generating',
          errorMessage: null,
        },
      });

      stream.next({ type: 'shot_generating', shotIndex });
      await this.waitForVideoTask(projectId, shotId, shotIndex, task.taskId, userId, stream);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.videoShot.update({
        where: { id: shotId },
        data: {
          status: 'failed',
          errorMessage: message,
        },
      });
      stream.next({ type: 'shot_failed', shotIndex, error: message });
    }
  }

  private async waitForVideoTask(
    projectId: string,
    shotId: string,
    shotIndex: number,
    taskId: string,
    userId: string,
    stream: Subject<VideoAgentEvent>,
  ): Promise<void> {
    try {
      const task = await this.videoService.waitForTaskTerminal(taskId, userId, 10 * 60 * 1_000);
      if (task.status === VideoTaskStatus.completed) {
        await this.prisma.videoShot.update({
          where: { id: shotId },
          data: {
            status: 'done',
            errorMessage: null,
          },
        });
        stream.next({
          type: 'shot_done',
          shotIndex,
          videoUrl: task.videoUrl ?? task.providerVideoUrl ?? '',
        });
        return;
      }

      const message = `VideoTask ${taskId} ended with status ${task.status}`;
      await this.prisma.videoShot.update({
        where: { id: shotId },
        data: {
          status: 'failed',
          errorMessage: message,
        },
      });
      stream.next({
        type: 'shot_failed',
        shotIndex,
        error: message,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `VideoTask ${taskId} timed out after 10 minutes`;
      await this.prisma.videoShot.update({
        where: { id: shotId },
        data: {
          status: 'failed',
          errorMessage: message,
        },
      });
      stream.next({
        type: 'shot_failed',
        shotIndex,
        error: message,
      });
      this.logger.warn(`video project ${projectId} shot ${shotIndex} failed while waiting: ${message}`);
    }
  }

  private toProjectDto(project: ProjectWithRelations): VideoProjectDto {
    const shots: VideoShotDto[] = project.shots.map((shot) => ({
      id: shot.id,
      shotIndex: shot.shotIndex,
      description: shot.description,
      cameraMovement: shot.cameraMovement ?? undefined,
      finalPrompt: shot.finalPrompt ?? undefined,
      duration: shot.duration ?? undefined,
      aspectRatio: shot.aspectRatio ?? undefined,
      resolution: shot.resolution ?? undefined,
      status: shot.status,
      videoUrl: shot.videoTask?.storedVideoPath ?? shot.videoTask?.providerVideoUrl ?? undefined,
      errorMessage: shot.errorMessage ?? undefined,
    }));

    const doneCount = shots.filter((shot) => shot.status === 'done').length;
    const progress = shots.length ? Math.round((doneCount / shots.length) * 100) : 0;

    return {
      id: project.id,
      userId: project.userId,
      packageId: project.packageId,
      packageName: project.package.name,
      storyBrief: project.storyBrief ?? undefined,
      status: project.status,
      shots,
      progress,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException(`video project ${projectId} not found`);
    }
  }

  private createLiveEventStream(projectId: string): Observable<VideoAgentEvent> {
    const subject = this.streams.get(projectId);
    if (!subject) {
      return EMPTY;
    }

    return new RxObservable<VideoAgentEvent>((observer) => {
      const subscription = subject.subscribe({
        next: (event) => observer.next(event),
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
      return () => subscription.unsubscribe();
    });
  }

  private createProjectStateStream(
    projectId: string,
    userId: string,
  ): Observable<ProjectStateEvent> {
    return interval(PROJECT_STREAM_POLL_MS).pipe(
      startWith(0),
      switchMap(() => from(this.getProject(projectId, userId))),
      map((project) => this.toProjectStateEvent(project)),
      distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next)),
      takeWhile((event) => !this.isTerminalProjectStatus(event.status), true),
    );
  }

  private async generateShotsWithConcurrency(
    projectId: string,
    shots: Array<Pick<VideoShot, 'id' | 'shotIndex'>>,
    userId: string,
    stream: Subject<VideoAgentEvent>,
  ): Promise<void> {
    const queue = [...shots];
    const workerCount = Math.min(MAX_ACTIVE_SHOT_GENERATIONS, queue.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const nextShot = queue.shift();
          if (!nextShot) {
            return;
          }
          await this.generateShot(projectId, nextShot.id, nextShot.shotIndex, userId, stream);
        }
      }),
    );
  }

  private toProjectStateEvent(project: VideoProjectDto): ProjectStateEvent {
    const completedShots = project.shots.filter((shot) => shot.status === 'done').length;
    const failedShots = project.shots.filter((shot) => shot.status === 'failed').length;
    return {
      type: 'project_state',
      projectId: project.id,
      status: project.status,
      progress: project.progress,
      totalShots: project.shots.length,
      completedShots,
      failedShots,
      updatedAt: project.updatedAt,
    };
  }

  private isTerminalProjectStatus(status: VideoProjectDto['status']): boolean {
    return status === 'done' || status === 'failed';
  }

  private async resolvePlannedShots(
    creativePackage: CreativePackageDto,
    storyBrief: string | undefined,
    providedScenes: StoryboardSceneInput[],
  ): Promise<PlannedShot[]> {
    if (providedScenes.length > 0) {
      return providedScenes.map((scene, index) => ({
        shotIndex: index + 1,
        description: scene.prompt.trim() || scene.description?.trim() || `Scene ${index + 1}`,
        cameraMovement: scene.cameraMovement?.trim() || 'static',
        duration: scene.duration && scene.duration > 0 ? Math.round(scene.duration) : creativePackage.stylePreset.duration,
      }));
    }
    return this.shotPlanner.planShots(creativePackage, storyBrief);
  }
}
