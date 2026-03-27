import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';
import type {
  CreativePackageDto,
  StoryboardSceneInput,
  VideoProjectDto,
} from '../models/video-agent.models';
import type {
  WorkbenchHistoryItem,
  WorkbenchPackageDraft,
  WorkbenchScene,
} from '../models/video-workbench.models';
import { VideoAgentService } from './video-agent.service';
import {
  VideoService,
  type CreateVideoParams,
  type VideoTask,
} from './video.service';

@Injectable({ providedIn: 'root' })
export class VideoWorkbenchService {
  private readonly videoService = inject(VideoService);
  private readonly videoAgentService = inject(VideoAgentService);

  loadAssets(): Observable<CreativePackageDto[]> {
    return this.videoAgentService.listPackages();
  }

  saveAsset(
    draft: WorkbenchPackageDraft,
    current?: CreativePackageDto,
  ): Observable<CreativePackageDto> {
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      source: current?.source === 'static' ? 'static' : 'user',
      characters: draft.characterSummary
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((appearancePrompt, index) => ({
          name: `角色 ${index + 1}`,
          appearancePrompt,
        })),
      worldStyle: {
        colorTone: '',
        era: '',
        atmosphere: '',
        sceneKeywords: draft.keywordText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      },
      stylePreset: {
        shotStyle: draft.shotStyle.trim() || 'cinematic',
        aspectRatio: draft.aspectRatio.trim() || '16:9',
        resolution: draft.resolution.trim() || '720p',
        duration: Math.max(1, Math.round(draft.duration)),
      },
    };

    if (current?.id) {
      return this.videoAgentService.updatePackage(current.id, payload);
    }
    return this.videoAgentService.createPackage(payload);
  }

  deleteAsset(id: string): Observable<void> {
    return this.videoAgentService.deletePackage(id);
  }

  planScenes(packageId: string, storyBrief: string): Observable<WorkbenchScene[]> {
    return this.videoAgentService.planScenes(packageId, storyBrief).pipe(
      map((scenes) =>
        scenes.map((scene, index) => ({
          id: this.createSceneId(index),
          prompt: scene.prompt,
          duration: scene.duration,
          description: scene.description,
          cameraMovement: scene.cameraMovement,
        })),
      ),
    );
  }

  createStoryboard(
    packageId: string,
    storyBrief: string,
    scenes: WorkbenchScene[],
  ): Observable<VideoProjectDto> {
    const payloadScenes: StoryboardSceneInput[] = scenes.map((scene) => ({
      prompt: scene.prompt.trim(),
      duration: scene.duration,
      description: scene.description?.trim() || undefined,
      cameraMovement: scene.cameraMovement?.trim() || undefined,
    }));

    return this.videoAgentService.createProject({
      packageId,
      storyBrief: storyBrief.trim() || undefined,
      scenes: payloadScenes,
    });
  }

  createSingle(
    input: CreateVideoParams,
    selectedPackage?: CreativePackageDto,
  ): Observable<VideoTask> {
    const enrichedPrompt = this.appendPackageContext(input.prompt, selectedPackage);
    return this.videoService.createTask({
      ...input,
      prompt: enrichedPrompt,
    });
  }

  loadHistory(): Observable<WorkbenchHistoryItem[]> {
    return forkJoin({
      tasks: this.videoService.listTasks(),
      projects: this.videoAgentService.listProjects(),
    }).pipe(
      map(({ tasks, projects }) =>
        [...tasks.map((task) => this.mapTask(task)), ...projects.map((project) => this.mapProject(project))]
          .sort((left, right) => right.createdAt - left.createdAt),
      ),
    );
  }

  private mapTask(task: VideoTask): WorkbenchHistoryItem {
    return {
      id: task.taskId,
      type: 'single',
      title: task.prompt,
      subtitle: task.mode === 'image' ? '图片驱动' : '文本创作',
      status: task.status,
      createdAt: task.createdAt,
      scenes: [
        {
          id: task.taskId,
          prompt: task.prompt,
          duration: task.duration,
          status: this.mapTaskStatus(task.status),
          videoUrl: task.videoUrl,
        },
      ],
    };
  }

  private mapProject(project: VideoProjectDto): WorkbenchHistoryItem {
    return {
      id: project.id,
      type: 'storyboard',
      title: project.storyBrief || project.packageName,
      subtitle: `${project.packageName} · ${project.shots.length} scenes`,
      status: project.status,
      createdAt: Date.parse(project.createdAt),
      scenes: project.shots.map((shot) => ({
        id: shot.id,
        prompt: shot.finalPrompt || shot.description,
        description: shot.description,
        duration: shot.duration,
        status: shot.status,
        videoUrl: shot.videoUrl,
      })),
    };
  }

  private appendPackageContext(
    prompt: string,
    selectedPackage?: CreativePackageDto,
  ): string {
    if (!selectedPackage) {
      return prompt.trim();
    }

    const characterLine = selectedPackage.characters
      .map((item) => item.appearancePrompt)
      .filter(Boolean)
      .join(', ');
    const keywordLine = selectedPackage.worldStyle.sceneKeywords.join(', ');

    return [
      prompt.trim(),
      selectedPackage.description || '',
      characterLine,
      keywordLine,
      selectedPackage.stylePreset.shotStyle,
    ]
      .filter(Boolean)
      .join(', ');
  }

  private mapTaskStatus(status: VideoTask['status']): WorkbenchScene['status'] {
    switch (status) {
      case 'completed':
        return 'done';
      case 'running':
        return 'generating';
      case 'failed':
      case 'cancelled':
        return 'failed';
      case 'pending':
      default:
        return 'pending';
    }
  }

  private createSceneId(index: number): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `scene-${Date.now()}-${index}`;
  }
}
