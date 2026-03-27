import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreateVideoParams {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  durationUnit?: 'seconds' | 'frames';
  firstFrameImage?: string;
  lastFrameImage?: string;
}

export interface VideoStatus {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

export interface SeedanceHistoryItem {
  taskId: string;
  prompt: string;
  mode: 'text' | 'image' | 'keyframe';
  status: VideoStatus['status'];
  videoUrl?: string;
  aspectRatio?: string;
  resolution?: string;
  createdAt: number;
}

export interface SeedanceConfig {
  aspectRatios: string[];
  resolutions: string[];
  durationUnits: Array<'seconds' | 'frames'>;
  maxCount: number;
}

const HISTORY_KEY = 'seeddance_history';
const HISTORY_MAX = 50;

@Injectable({ providedIn: 'root' })
export class SeedanceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/seeddance`;

  createVideo(params: CreateVideoParams): Observable<{ taskId: string }> {
    return this.http.post<{ taskId: string }>(`${this.base}/video`, params);
  }

  getVideoStatus(taskId: string): Observable<VideoStatus> {
    return this.http.get<VideoStatus>(`${this.base}/video/${encodeURIComponent(taskId)}`);
  }

  streamVideoStatus(taskId: string): Observable<VideoStatus> {
    return new Observable<VideoStatus>((observer) => {
      const source = new EventSource(`${this.base}/video/${encodeURIComponent(taskId)}/stream`);

      const handleMessage = (event: MessageEvent<string>) => {
        try {
          const status = JSON.parse(event.data) as VideoStatus;
          observer.next(status);
          if (status.status === 'completed' || status.status === 'failed') {
            observer.complete();
            source.close();
          }
        } catch {
          // ignore malformed SSE payloads
        }
      };

      source.onmessage = handleMessage;
      // Named "error" event frames from the server (distinct from connection errors)
      source.addEventListener('error', handleMessage as EventListener);

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

  getConfig(): Observable<SeedanceConfig> {
    return this.http.get<SeedanceConfig>(`${this.base}/config`);
  }

  // ── History (localStorage) ──────────────────────────────────────────

  getHistory(): SeedanceHistoryItem[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? (JSON.parse(raw) as SeedanceHistoryItem[]) : [];
    } catch {
      return [];
    }
  }

  addHistory(item: SeedanceHistoryItem): void {
    const list = this.getHistory().filter((h) => h.taskId !== item.taskId);
    list.unshift(item);
    this.saveHistory(list.slice(0, HISTORY_MAX));
  }

  updateHistory(taskId: string, patch: Partial<SeedanceHistoryItem>): void {
    const list = this.getHistory().map((h) =>
      h.taskId === taskId ? { ...h, ...patch } : h,
    );
    this.saveHistory(list);
  }

  private saveHistory(list: SeedanceHistoryItem[]): void {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {
      // quota exceeded – silently ignore
    }
  }
}
