import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreateVideoParams {
  prompt: string;
  mode?: 'text' | 'image' | 'keyframe';
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  durationUnit?: 'seconds' | 'frames';
  firstFrameImage?: string;
  lastFrameImage?: string;
}

interface VideoTaskApi {
  taskId: string;
  provider: 'seedance';
  prompt: string;
  mode: 'text' | 'image' | 'keyframe';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  durationUnit?: 'seconds' | 'frames';
  videoUrl?: string;
  providerVideoUrl?: string;
  firstFrameAssetPath?: string;
  lastFrameAssetPath?: string;
  error?: string;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
}

export interface VideoTask {
  taskId: string;
  provider: 'seedance';
  prompt: string;
  mode: 'text' | 'image' | 'keyframe';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  durationUnit?: 'seconds' | 'frames';
  videoUrl?: string;
  providerVideoUrl?: string;
  firstFrameAssetPath?: string;
  lastFrameAssetPath?: string;
  error?: string;
  canCancel: boolean;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  cancelledAt?: number;
}

export interface VideoConfig {
  aspectRatios: string[];
  resolutions: string[];
  durationUnits: Array<'seconds' | 'frames'>;
  maxCount: number;
  model: string;
}

@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/videos`;

  createTask(params: CreateVideoParams): Observable<VideoTask> {
    return this.http
      .post<VideoTaskApi>(`${this.base}/tasks`, params)
      .pipe(map((task) => this.mapTask(task)));
  }

  listTasks(limit = 50): Observable<VideoTask[]> {
    return this.http
      .get<VideoTaskApi[]>(`${this.base}/tasks`, {
        params: { limit },
      })
      .pipe(map((tasks) => tasks.map((task) => this.mapTask(task))));
  }

  getTask(taskId: string): Observable<VideoTask> {
    return this.http
      .get<VideoTaskApi>(`${this.base}/tasks/${encodeURIComponent(taskId)}`)
      .pipe(map((task) => this.mapTask(task)));
  }

  streamTask(taskId: string): Observable<VideoTask> {
    return new Observable<VideoTask>((observer) => {
      const source = new EventSource(`${this.base}/tasks/${encodeURIComponent(taskId)}/stream`);

      const handleTask = (event: MessageEvent<string>) => {
        try {
          const task = this.mapTask(JSON.parse(event.data) as VideoTaskApi);
          observer.next(task);
          if (
            task.status === 'completed' ||
            task.status === 'failed' ||
            task.status === 'cancelled'
          ) {
            observer.complete();
            source.close();
          }
        } catch {
          // ignore malformed SSE payloads
        }
      };

      source.onmessage = handleTask;
      source.addEventListener('error', ((event: Event) => {
        if (!('data' in event) || typeof (event as MessageEvent<string>).data !== 'string') {
          return;
        }
        try {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { error?: string };
          observer.error(new Error(payload.error || 'Video task stream error'));
        } catch {
          observer.error(new Error('Video task stream error'));
        }
        source.close();
      }) as EventListener);

      source.onerror = () => {
        if (source.readyState === EventSource.CLOSED) {
          observer.complete();
          return;
        }
        observer.error(new Error('SSE connection error'));
        source.close();
      };

      return () => source.close();
    });
  }

  cancelTask(taskId: string): Observable<VideoTask> {
    return this.http
      .post<VideoTaskApi>(`${this.base}/tasks/${encodeURIComponent(taskId)}/cancel`, {})
      .pipe(map((task) => this.mapTask(task)));
  }

  getConfig(): Observable<VideoConfig> {
    return this.http.get<VideoConfig>(`${this.base}/config`);
  }

  private mapTask(task: VideoTaskApi): VideoTask {
    return {
      taskId: task.taskId,
      provider: task.provider,
      prompt: task.prompt,
      mode: task.mode,
      status: task.status,
      aspectRatio: task.aspectRatio,
      resolution: task.resolution,
      duration: task.duration,
      durationUnit: task.durationUnit,
      videoUrl: this.resolveUrl(task.videoUrl),
      providerVideoUrl: this.resolveUrl(task.providerVideoUrl),
      firstFrameAssetPath: this.resolveUrl(task.firstFrameAssetPath),
      lastFrameAssetPath: this.resolveUrl(task.lastFrameAssetPath),
      error: task.error,
      canCancel: task.canCancel,
      createdAt: Date.parse(task.createdAt),
      updatedAt: Date.parse(task.updatedAt),
      startedAt: task.startedAt ? Date.parse(task.startedAt) : undefined,
      completedAt: task.completedAt ? Date.parse(task.completedAt) : undefined,
      failedAt: task.failedAt ? Date.parse(task.failedAt) : undefined,
      cancelledAt: task.cancelledAt ? Date.parse(task.cancelledAt) : undefined,
    };
  }

  private resolveUrl(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    if (value.startsWith('/')) {
      return `${environment.apiUrl}${value}`;
    }
    return value;
  }
}
