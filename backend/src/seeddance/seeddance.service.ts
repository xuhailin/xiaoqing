import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MessageEvent } from '@nestjs/common';
import { Observable, catchError, from, interval, map, of, startWith, switchMap, takeWhile } from 'rxjs';
import type { CreateVideoDto } from './dto/create-video.dto';
import type { VideoStatusDto } from './dto/video-status.dto';

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_MODEL = 'doubao-seedance-1-0-pro-250528';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_ASPECT_RATIO = '16:9';
const DEFAULT_RESOLUTION = '720p';
const DEFAULT_DURATION = 5;
const POLL_INTERVAL_MS = 4_000;

interface SeedanceTaskResponse {
  id: string;
}

interface SeedanceTaskDetail {
  id: string;
  status: string;
  content?: {
    video_url?: string;
  };
  error?: {
    message?: string;
  };
}

@Injectable()
export class SeedanceService {
  private readonly logger = new Logger(SeedanceService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.apiKey =
      this.config.get<string>('SEEDDANCE_API_KEY')?.trim() ??
      this.config.get<string>('ARK_API_KEY')?.trim() ??
      '';
    this.baseUrl = (
      this.config.get<string>('SEEDDANCE_BASE_URL')?.trim() || DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    this.model = this.config.get<string>('SEEDDANCE_MODEL')?.trim() || DEFAULT_MODEL;
    this.timeoutMs = this.parseTimeout(this.config.get<string>('SEEDDANCE_TIMEOUT'));
  }

  async createVideoTask(dto: CreateVideoDto): Promise<{ taskId: string }> {
    const prompt = dto.prompt?.trim();
    if (!prompt) {
      throw new BadRequestException('prompt is required');
    }

    const aspectRatio = dto.aspectRatio?.trim() || DEFAULT_ASPECT_RATIO;
    const resolution = dto.resolution?.trim() || DEFAULT_RESOLUTION;
    const durationValue = dto.duration ?? DEFAULT_DURATION;
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      throw new BadRequestException('duration must be a positive number');
    }

    this.validateImageInput(dto.firstFrameImage, 'firstFrameImage');
    this.validateImageInput(dto.lastFrameImage, 'lastFrameImage');

    const durationSeconds = this.toDurationSeconds(durationValue, dto.durationUnit ?? 'seconds');
    const promptFlags = [
      `--resolution ${resolution}`,
      `--ratio ${aspectRatio}`,
      `--duration ${durationSeconds}`,
    ];
    const content: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: [prompt, ...promptFlags].join('  '),
      },
    ];

    if (dto.firstFrameImage) {
      content.push({
        type: 'image_url',
        image_url: { url: dto.firstFrameImage },
        role: 'first_frame',
      });
    }

    if (dto.lastFrameImage) {
      content.push({
        type: 'image_url',
        image_url: { url: dto.lastFrameImage },
        role: 'last_frame',
      });
    }

    const response = await this.fetchJson<SeedanceTaskResponse>('/contents/generations/tasks', {
      method: 'POST',
      body: JSON.stringify({
        model: this.model,
        content,
      }),
    });

    if (!response.id) {
      throw new Error('Seedance submit failed: missing task id');
    }

    this.logger.log(`[Seedance] task created: ${response.id}`);
    return { taskId: response.id };
  }

  async getTaskStatus(taskId: string): Promise<VideoStatusDto> {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) {
      throw new BadRequestException('taskId is required');
    }

    const response = await this.fetchJson<SeedanceTaskDetail>(
      `/contents/generations/tasks/${encodeURIComponent(normalizedTaskId)}`,
      {
        method: 'GET',
      },
    );

    const videoUrl = response.content?.video_url ?? undefined;

    return {
      taskId: response.id || normalizedTaskId,
      status: this.mapStatus(response.status),
      videoUrl,
      error: response.error?.message,
    };
  }

  streamTaskStatus(taskId: string): Observable<MessageEvent> {
    return interval(POLL_INTERVAL_MS).pipe(
      startWith(0),
      switchMap(() =>
        from(this.getTaskStatus(taskId)).pipe(
          catchError((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(`[Seedance] poll error for ${taskId}: ${message}`);
            const errorStatus: VideoStatusDto = { taskId, status: 'failed', error: message };
            return of(errorStatus);
          }),
        ),
      ),
      map((status) => ({ data: JSON.stringify(status) }) as MessageEvent),
      takeWhile((event) => {
        const payload = JSON.parse(String(event.data)) as VideoStatusDto;
        return payload.status !== 'completed' && payload.status !== 'failed';
      }, true),
    );
  }

  private async fetchJson<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Seedance API key is missing. Please set SEEDDANCE_API_KEY or ARK_API_KEY.');
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new Error(`Seedance request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    }

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `Seedance request failed (${response.status}): ${message || response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }

  private mapStatus(rawStatus: string | undefined): VideoStatusDto['status'] {
    switch (rawStatus) {
      case 'running':
        return 'running';
      case 'succeeded':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'submitted':
      case 'queued':
      default:
        return 'pending';
    }
  }

  private toDurationSeconds(duration: number, unit: 'seconds' | 'frames'): number {
    if (unit === 'frames') {
      return Math.max(1, Math.round(duration / 24));
    }
    return Math.round(duration);
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

  private parseTimeout(rawValue: string | undefined): number {
    const parsed = Number(rawValue ?? DEFAULT_TIMEOUT_MS);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_TIMEOUT_MS;
    }
    return Math.round(parsed);
  }
}
