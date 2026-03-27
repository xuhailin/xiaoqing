import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  VideoDurationUnit,
  VideoTaskMode,
  VideoTaskStatus,
  type VideoTask,
} from '@prisma/client';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  catchError,
  filter,
  firstValueFrom,
  from,
  interval,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  take,
  timeout,
} from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';
import { SeedanceVideoProvider } from './providers/seedance-video.provider';
import type {
  CreateVideoTaskInput,
  VideoTaskConfigDto,
  VideoTaskDto,
} from './video.types';

const POLL_INTERVAL_MS = 4_000;
const VIDEO_INPUT_DIR = 'video-inputs';
const VIDEO_OUTPUT_DIR = 'video-results';
const ASSETS_ROOT = path.join(process.cwd(), 'assets');
const DEFAULT_ASPECT_RATIO = '16:9';
const DEFAULT_RESOLUTION = '720p';
const DEFAULT_DURATION = 5;

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seedanceProvider: SeedanceVideoProvider,
  ) {}

  getConfig(): VideoTaskConfigDto {
    return {
      aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      resolutions: ['480p', '720p', '1080p'],
      durationUnits: ['seconds', 'frames'],
      maxCount: 1,
      model: this.seedanceProvider.model,
    };
  }

  async createTask(input: CreateVideoTaskInput, userId: string): Promise<VideoTaskDto> {
    const prompt = input.prompt?.trim();
    if (!prompt) {
      throw new BadRequestException('prompt is required');
    }

    const mode = this.resolveMode(input);
    const aspectRatio = input.aspectRatio?.trim() || DEFAULT_ASPECT_RATIO;
    const resolution = input.resolution?.trim() || DEFAULT_RESOLUTION;
    const duration = this.normalizeDuration(input.duration);
    const durationUnit = this.normalizeDurationUnit(input.durationUnit);

    this.validateImageInput(input.firstFrameImage, 'firstFrameImage');
    this.validateImageInput(input.lastFrameImage, 'lastFrameImage');
    this.validateModeAssets(mode, input.firstFrameImage, input.lastFrameImage);

    const persistedAssets = await this.persistInputAssets({
      firstFrameImage: input.firstFrameImage,
      lastFrameImage: input.lastFrameImage,
    });

    try {
      const created = await this.seedanceProvider.createTask({
        ...input,
        prompt,
        mode,
        aspectRatio,
        resolution,
        duration,
        durationUnit,
      });

      const task = await this.prisma.videoTask.create({
        data: {
          id: created.taskId,
          userId,
          provider: 'seedance',
          prompt,
          mode,
          status: VideoTaskStatus.pending,
          providerStatus: 'queued',
          aspectRatio,
          resolution,
          duration,
          durationUnit,
          firstFrameAssetPath: persistedAssets.firstFrameAssetPath,
          lastFrameAssetPath: persistedAssets.lastFrameAssetPath,
          inputSnapshot: {
            mode,
            hasFirstFrame: Boolean(input.firstFrameImage),
            hasLastFrame: Boolean(input.lastFrameImage),
            firstFrameAssetPath: persistedAssets.firstFrameAssetPath,
            lastFrameAssetPath: persistedAssets.lastFrameAssetPath,
          } satisfies Prisma.JsonObject,
          providerPayload: {
            provider: 'seedance',
            aspectRatio,
            resolution,
            duration,
            durationUnit,
          } satisfies Prisma.JsonObject,
          providerResponse: this.toJsonValue(created.providerResponse),
        },
      });

      return this.mapTask(task);
    } catch (error) {
      await this.cleanupAssetPath(persistedAssets.firstFrameAssetPath);
      await this.cleanupAssetPath(persistedAssets.lastFrameAssetPath);
      throw error;
    }
  }

  async listTasks(
    userId: string,
    options?: { status?: VideoTaskStatus; limit?: number },
  ): Promise<VideoTaskDto[]> {
    const limit = this.normalizeLimit(options?.limit);
    const tasks = await this.prisma.videoTask.findMany({
      where: {
        userId,
        status: options?.status,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    const refreshed = await Promise.all(tasks.map((task) => this.refreshTask(task, true)));
    return refreshed.map((task) => this.mapTask(task));
  }

  async getTask(taskId: string, userId: string): Promise<VideoTaskDto> {
    const task = await this.getOwnedTask(taskId, userId);
    return this.mapTask(await this.refreshTask(task, true));
  }

  streamTask(taskId: string, userId: string): Observable<MessageEvent> {
    return interval(POLL_INTERVAL_MS).pipe(
      startWith(0),
      switchMap(() =>
        from(this.getOwnedTask(taskId, userId)).pipe(
          switchMap((task) => from(this.refreshTask(task, false))),
          switchMap((task) => of(this.toMessageEvent(task))),
          catchError((error: unknown) =>
            of({
              type: 'error',
              data: JSON.stringify({
                taskId,
                error: error instanceof Error ? error.message : String(error),
              }),
            } satisfies MessageEvent),
          ),
        ),
      ),
    );
  }

  async cancelTask(taskId: string, userId: string): Promise<VideoTaskDto> {
    const task = await this.getOwnedTask(taskId, userId);
    if (this.isTerminal(task.status)) {
      return this.mapTask(task);
    }
    if (task.status !== VideoTaskStatus.pending) {
      throw new BadRequestException('Only queued tasks can be cancelled currently');
    }

    await this.seedanceProvider.cancelTask(task.id);

    const updated = await this.prisma.videoTask.update({
      where: { id: task.id },
      data: {
        status: VideoTaskStatus.cancelled,
        providerStatus: 'cancelled',
        cancelledAt: new Date(),
        errorMessage: null,
      },
    });

    return this.mapTask(updated);
  }

  async waitForTaskTerminal(
    taskId: string,
    userId: string,
    timeoutMs = 10 * 60 * 1_000,
  ): Promise<VideoTaskDto> {
    return firstValueFrom(
      this.streamTask(taskId, userId).pipe(
        map((event) => this.parseTaskEvent(event)),
        filter((task): task is VideoTaskDto => task !== null && this.isTerminalTaskStatus(task.status)),
        take(1),
        timeout({ first: timeoutMs }),
      ),
    );
  }

  private async refreshTask(task: VideoTask, suppressErrors: boolean): Promise<VideoTask> {
    if (task.status === VideoTaskStatus.completed) {
      return this.ensureStoredVideo(task);
    }
    if (this.isTerminal(task.status)) {
      return task;
    }

    try {
      const providerTask = await this.seedanceProvider.getTask(task.id);
      let nextStatus = providerTask.status;
      let errorMessage = providerTask.error ?? null;
      let providerVideoUrl = providerTask.videoUrl ?? task.providerVideoUrl ?? null;
      let storedVideoPath = task.storedVideoPath;

      if (nextStatus === 'failed' && !errorMessage && providerTask.providerStatus === 'expired') {
        errorMessage = 'Seedance task expired before completion';
      }

      if (nextStatus === 'completed' && providerVideoUrl && !storedVideoPath) {
        storedVideoPath = await this.persistOutputVideo(task.id, providerVideoUrl).catch(() => null);
      }

      const nextData: Prisma.VideoTaskUpdateInput = {
        status: nextStatus,
        providerStatus: providerTask.providerStatus,
        providerResponse: this.toJsonValue(providerTask.providerResponse),
        providerVideoUrl,
        storedVideoPath,
        errorMessage,
        startedAt:
          nextStatus === 'running'
            ? (task.startedAt ?? new Date())
            : task.startedAt,
        completedAt:
          nextStatus === 'completed'
            ? (task.completedAt ?? new Date())
            : task.completedAt,
        failedAt:
          nextStatus === 'failed'
            ? (task.failedAt ?? new Date())
            : task.failedAt,
        cancelledAt:
          nextStatus === 'cancelled'
            ? (task.cancelledAt ?? new Date())
            : task.cancelledAt,
      };

      if (!this.hasMeaningfulChanges(task, nextData)) {
        return storedVideoPath && storedVideoPath !== task.storedVideoPath
          ? this.getOwnedTask(task.id, task.userId)
          : {
              ...task,
              status: nextStatus,
              providerStatus: providerTask.providerStatus,
              providerVideoUrl,
              storedVideoPath,
              errorMessage,
            };
      }

      return this.prisma.videoTask.update({
        where: { id: task.id },
        data: nextData,
      });
    } catch (error) {
      if (suppressErrors) {
        return task;
      }
      throw error;
    }
  }

  private async ensureStoredVideo(task: VideoTask): Promise<VideoTask> {
    if (!task.providerVideoUrl || task.storedVideoPath) {
      return task;
    }

    const storedVideoPath = await this.persistOutputVideo(task.id, task.providerVideoUrl).catch(
      () => null,
    );
    if (!storedVideoPath) {
      return task;
    }

    return this.prisma.videoTask.update({
      where: { id: task.id },
      data: { storedVideoPath },
    });
  }

  private async getOwnedTask(taskId: string, userId: string): Promise<VideoTask> {
    const task = await this.prisma.videoTask.findUnique({
      where: { id: taskId.trim() },
    });
    if (!task || task.userId !== userId) {
      throw new NotFoundException('video task not found');
    }
    return task;
  }

  private mapTask(task: VideoTask): VideoTaskDto {
    return {
      taskId: task.id,
      provider: 'seedance',
      prompt: task.prompt,
      mode: task.mode,
      status: task.status,
      aspectRatio: task.aspectRatio ?? undefined,
      resolution: task.resolution ?? undefined,
      duration: task.duration ?? undefined,
      durationUnit: task.durationUnit ?? undefined,
      videoUrl: task.storedVideoPath ?? task.providerVideoUrl ?? undefined,
      providerVideoUrl: task.providerVideoUrl ?? undefined,
      firstFrameAssetPath: task.firstFrameAssetPath ?? undefined,
      lastFrameAssetPath: task.lastFrameAssetPath ?? undefined,
      error: task.errorMessage ?? undefined,
      canCancel: task.status === VideoTaskStatus.pending,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      failedAt: task.failedAt?.toISOString(),
      cancelledAt: task.cancelledAt?.toISOString(),
    };
  }

  private toMessageEvent(task: VideoTask): MessageEvent {
    return {
      data: JSON.stringify(this.mapTask(task)),
    };
  }

  private parseTaskEvent(event: MessageEvent): VideoTaskDto | null {
    const raw = typeof event.data === 'string' ? event.data : '';
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || !('status' in parsed)) {
        return null;
      }
      return parsed as VideoTaskDto;
    } catch {
      return null;
    }
  }

  private isTerminal(status: VideoTaskStatus): boolean {
    return (
      status === VideoTaskStatus.completed ||
      status === VideoTaskStatus.failed ||
      status === VideoTaskStatus.cancelled
    );
  }

  private isTerminalTaskStatus(status: VideoTaskDto['status']): boolean {
    return status === 'completed' || status === 'failed' || status === 'cancelled';
  }

  private resolveMode(input: CreateVideoTaskInput): VideoTaskMode {
    if (input.mode) {
      return input.mode as VideoTaskMode;
    }
    if (input.lastFrameImage) {
      return VideoTaskMode.keyframe;
    }
    if (input.firstFrameImage) {
      return VideoTaskMode.image;
    }
    return VideoTaskMode.text;
  }

  private normalizeDuration(value: number | undefined): number {
    const parsed = Number(value ?? DEFAULT_DURATION);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('duration must be a positive number');
    }
    return Math.round(parsed);
  }

  private normalizeDurationUnit(value: string | undefined): VideoDurationUnit {
    if (value === 'frames') {
      return VideoDurationUnit.frames;
    }
    return VideoDurationUnit.seconds;
  }

  private normalizeLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit)) {
      return 50;
    }
    return Math.max(1, Math.min(100, Math.round(limit as number)));
  }

  private validateModeAssets(
    mode: VideoTaskMode,
    firstFrameImage?: string,
    lastFrameImage?: string,
  ): void {
    if (mode === VideoTaskMode.text && (firstFrameImage || lastFrameImage)) {
      throw new BadRequestException('text mode does not accept frame images');
    }
    if (mode === VideoTaskMode.image && !firstFrameImage) {
      throw new BadRequestException('image mode requires firstFrameImage');
    }
    if (mode === VideoTaskMode.keyframe && (!firstFrameImage || !lastFrameImage)) {
      throw new BadRequestException('keyframe mode requires both firstFrameImage and lastFrameImage');
    }
  }

  private validateImageInput(value: string | undefined, fieldName: string): void {
    if (!value) {
      return;
    }

    const isHttpUrl = /^https?:\/\//i.test(value);
    const isDataUrl = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value);
    if (!isHttpUrl && !isDataUrl) {
      throw new BadRequestException(
        `${fieldName} must be an http(s) url or base64 image data url`,
      );
    }
  }

  private async persistInputAssets(input: {
    firstFrameImage?: string;
    lastFrameImage?: string;
  }): Promise<{ firstFrameAssetPath: string | null; lastFrameAssetPath: string | null }> {
    return {
      firstFrameAssetPath: await this.persistAsset(input.firstFrameImage, 'first'),
      lastFrameAssetPath: await this.persistAsset(input.lastFrameImage, 'last'),
    };
  }

  private async persistAsset(source: string | undefined, label: string): Promise<string | null> {
    if (!source) {
      return null;
    }

    await mkdir(path.join(ASSETS_ROOT, VIDEO_INPUT_DIR), { recursive: true });
    const fileId = `${label}-${Date.now()}-${randomUUID()}`;

    if (/^data:image\//i.test(source)) {
      const match = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        return null;
      }
      const mime = match[1] ?? 'image/jpeg';
      const ext = this.imageExtFromMime(mime);
      const fileName = `${fileId}.${ext}`;
      const filePath = path.join(ASSETS_ROOT, VIDEO_INPUT_DIR, fileName);
      const bytes = Buffer.from(match[2] ?? '', 'base64');
      await writeFile(filePath, bytes);
      return `/assets/${VIDEO_INPUT_DIR}/${fileName}`;
    }

    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        return source;
      }
      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const ext = this.imageExtFromMime(contentType);
      const fileName = `${fileId}.${ext}`;
      const filePath = path.join(ASSETS_ROOT, VIDEO_INPUT_DIR, fileName);
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(filePath, bytes);
      return `/assets/${VIDEO_INPUT_DIR}/${fileName}`;
    } catch {
      return source;
    }
  }

  private async persistOutputVideo(taskId: string, sourceUrl: string): Promise<string | null> {
    await mkdir(path.join(ASSETS_ROOT, VIDEO_OUTPUT_DIR), { recursive: true });
    const ext = this.fileExtFromUrl(sourceUrl, 'mp4');
    const fileName = `${taskId}.${ext}`;
    const filePath = path.join(ASSETS_ROOT, VIDEO_OUTPUT_DIR, fileName);

    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
      throw new Error(`video download failed (${response.status})`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, bytes);
    return `/assets/${VIDEO_OUTPUT_DIR}/${fileName}`;
  }

  private imageExtFromMime(mime: string): string {
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    return 'jpg';
  }

  private fileExtFromUrl(url: string, fallback: string): string {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname).replace(/^\./, '');
      return ext || fallback;
    } catch {
      return fallback;
    }
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private hasMeaningfulChanges(task: VideoTask, nextData: Prisma.VideoTaskUpdateInput): boolean {
    return (
      task.status !== nextData.status ||
      task.providerStatus !== nextData.providerStatus ||
      task.providerVideoUrl !== nextData.providerVideoUrl ||
      task.storedVideoPath !== nextData.storedVideoPath ||
      task.errorMessage !== nextData.errorMessage ||
      Boolean(nextData.startedAt && !task.startedAt) ||
      Boolean(nextData.completedAt && !task.completedAt) ||
      Boolean(nextData.failedAt && !task.failedAt) ||
      Boolean(nextData.cancelledAt && !task.cancelledAt)
    );
  }

  private async cleanupAssetPath(assetPath: string | null): Promise<void> {
    if (!assetPath || !assetPath.startsWith('/assets/')) {
      return;
    }
    const relativePath = assetPath.replace(/^\/assets\//, '');
    const filePath = path.join(ASSETS_ROOT, relativePath);
    await unlink(filePath).catch(() => {});
  }
}
