import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateVideoTaskInput,
  VideoTaskStatus,
} from '../video.types';

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_MODEL = 'doubao-seedance-1-0-pro-250528';
const DEFAULT_TIMEOUT_MS = 120_000;

interface SeedanceTaskResponse {
  id: string;
}

interface SeedanceTaskDetail {
  id: string;
  model?: string;
  status?: string;
  content?: {
    video_url?: string;
    last_frame_url?: string;
    file_url?: string | null;
  };
  error?: {
    message?: string;
  };
  created_at?: number;
  updated_at?: number;
}

@Injectable()
export class SeedanceVideoProvider {
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
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

  async createTask(input: CreateVideoTaskInput): Promise<{ taskId: string; providerResponse: unknown }> {
    const content: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: this.buildPrompt(input),
      },
    ];

    if (input.firstFrameImage) {
      content.push({
        type: 'image_url',
        image_url: { url: input.firstFrameImage },
        role: 'first_frame',
      });
    }

    if (input.lastFrameImage) {
      content.push({
        type: 'image_url',
        image_url: { url: input.lastFrameImage },
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
      throw new BadGatewayException('Seedance submit failed: missing task id');
    }

    return {
      taskId: response.id,
      providerResponse: response,
    };
  }

  async getTask(taskId: string): Promise<{
    taskId: string;
    providerStatus: string;
    status: VideoTaskStatus;
    videoUrl?: string;
    error?: string;
    providerResponse: unknown;
  }> {
    const response = await this.fetchJson<SeedanceTaskDetail>(
      `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      { method: 'GET' },
    );

    return {
      taskId: response.id || taskId,
      providerStatus: response.status ?? 'queued',
      status: this.mapStatus(response.status),
      videoUrl: response.content?.video_url ?? undefined,
      error: response.error?.message,
      providerResponse: response,
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    try {
      await this.fetchVoid(`/contents/generations/tasks/${encodeURIComponent(taskId)}/cancel`, {
        method: 'POST',
      });
      return;
    } catch (error) {
      // Best-effort compatibility fallback for providers exposing DELETE cancellation.
      await this.fetchVoid(`/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
      }).catch(() => {
        throw error;
      });
    }
  }

  private buildPrompt(input: CreateVideoTaskInput): string {
    const aspectRatio = input.aspectRatio?.trim() || '16:9';
    const resolution = input.resolution?.trim() || '720p';
    const durationValue = input.duration ?? 5;
    const durationUnit = input.durationUnit ?? 'seconds';
    const durationSeconds =
      durationUnit === 'frames'
        ? Math.max(1, Math.round(durationValue / 24))
        : Math.round(durationValue);

    const promptFlags = [
      `--resolution ${resolution}`,
      `--ratio ${aspectRatio}`,
      `--duration ${durationSeconds}`,
    ];

    return [input.prompt.trim(), ...promptFlags].join('  ');
  }

  private async fetchJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchResponse(path, init);
    return (await response.json()) as T;
  }

  private async fetchVoid(path: string, init: RequestInit): Promise<void> {
    await this.fetchResponse(path, init);
  }

  private async fetchResponse(path: string, init: RequestInit): Promise<Response> {
    if (!this.apiKey) {
      throw new BadGatewayException(
        'Seedance API key is missing. Please set SEEDDANCE_API_KEY or ARK_API_KEY.',
      );
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
        throw new BadGatewayException(`Seedance request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    }

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Seedance request failed (${response.status}): ${message || response.statusText}`,
      );
    }

    return response;
  }

  private mapStatus(rawStatus: string | undefined): VideoTaskStatus {
    switch (rawStatus) {
      case 'running':
        return 'running';
      case 'succeeded':
        return 'completed';
      case 'cancelled':
        return 'cancelled';
      case 'failed':
      case 'expired':
        return 'failed';
      case 'submitted':
      case 'queued':
      default:
        return 'pending';
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
