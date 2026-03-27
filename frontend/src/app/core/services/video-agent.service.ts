import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type {
  CreateVideoProjectInput,
  CreativePackageDto,
  CreativePackageInput,
  StoryboardSceneInput,
  VideoAgentEvent,
  VideoProjectDto,
} from '../models/video-agent.models';

@Injectable({ providedIn: 'root' })
export class VideoAgentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/video-agent`;

  listPackages(): Observable<CreativePackageDto[]> {
    return this.http
      .get<CreativePackageDto[]>(`${this.base}/packages`)
      .pipe(map((packages) => packages.map((pkg) => this.mapPackage(pkg))));
  }

  getPackage(id: string): Observable<CreativePackageDto> {
    return this.http
      .get<CreativePackageDto>(`${this.base}/packages/${encodeURIComponent(id)}`)
      .pipe(map((pkg) => this.mapPackage(pkg)));
  }

  createPackage(dto: CreativePackageInput): Observable<CreativePackageDto> {
    return this.http
      .post<CreativePackageDto>(`${this.base}/packages`, dto)
      .pipe(map((pkg) => this.mapPackage(pkg)));
  }

  updatePackage(id: string, dto: CreativePackageInput): Observable<CreativePackageDto> {
    return this.http
      .put<CreativePackageDto>(`${this.base}/packages/${encodeURIComponent(id)}`, dto)
      .pipe(map((pkg) => this.mapPackage(pkg)));
  }

  deletePackage(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/packages/${encodeURIComponent(id)}`);
  }

  createProject(input: CreateVideoProjectInput): Observable<VideoProjectDto> {
    return this.http
      .post<VideoProjectDto>(`${this.base}/projects`, input)
      .pipe(map((project) => this.mapProject(project)));
  }

  planScenes(packageId: string, storyBrief: string): Observable<StoryboardSceneInput[]> {
    return this.http.post<StoryboardSceneInput[]>(`${this.base}/plans/scenes`, {
      packageId,
      storyBrief,
    });
  }

  getProject(id: string): Observable<VideoProjectDto> {
    return this.http
      .get<VideoProjectDto>(`${this.base}/projects/${encodeURIComponent(id)}`)
      .pipe(map((project) => this.mapProject(project)));
  }

  listProjects(): Observable<VideoProjectDto[]> {
    return this.http
      .get<VideoProjectDto[]>(`${this.base}/projects`)
      .pipe(map((projects) => projects.map((project) => this.mapProject(project))));
  }

  streamProject(projectId: string): Observable<VideoAgentEvent> {
    return new Observable<VideoAgentEvent>((observer) => {
      const source = new EventSource(
        `${this.base}/projects/${encodeURIComponent(projectId)}/stream`,
      );

      source.onmessage = (event: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(event.data) as VideoAgentEvent;
          observer.next(parsed);
          if (parsed.type === 'project_done' || parsed.type === 'project_failed') {
            observer.complete();
            source.close();
          }
        } catch {
          // ignore malformed stream payloads
        }
      };

      source.onerror = () => {
        observer.complete();
        source.close();
      };

      return () => source.close();
    });
  }

  private mapPackage(pkg: CreativePackageDto): CreativePackageDto {
    return {
      ...pkg,
      coverImage: this.resolveUrl(pkg.coverImage),
    };
  }

  private mapProject(project: VideoProjectDto): VideoProjectDto {
    return {
      ...project,
      shots: project.shots.map((shot) => ({
        ...shot,
        videoUrl: this.resolveUrl(shot.videoUrl),
      })),
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
