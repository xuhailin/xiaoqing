import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import type { VideoAgentEvent, VideoProjectDto } from '../../../core/models/video-agent.models';
import { VideoAgentService } from '../../../core/services/video-agent.service';
import { ActivatedRoute } from '@angular/router';
import { ShotCardComponent } from '../../components/shot-card/shot-card.component';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [RouterLink, ShotCardComponent],
  template: `
    <section class="project-detail">
      <header class="project-detail__head">
        <div>
          <p class="project-detail__eyebrow">Project Detail</p>
          <h1>{{ project()?.packageName || '视频项目' }}</h1>
          <p>{{ project()?.storyBrief || '未填写故事概要' }}</p>
        </div>
        <div class="project-detail__actions">
          <a routerLink="/video/projects">返回列表</a>
          <a routerLink="/video/projects/new">再建一个</a>
        </div>
      </header>

      @if (loading()) {
        <p class="state-card">正在加载项目...</p>
      } @else if (error()) {
        <p class="state-card state-card--error">{{ error() }}</p>
      } @else if (project(); as currentProject) {
        <section class="summary-card">
          <div>
            <strong>{{ statusLabel(currentProject.status) }}</strong>
            <p>当前进度 {{ currentProject.progress }}%</p>
          </div>
          <div>
            <strong>{{ currentProject.shots.length }}</strong>
            <p>分镜数量</p>
          </div>
          <div>
            <strong>{{ lastEvent() || '等待事件' }}</strong>
            <p>最近状态</p>
          </div>
        </section>

        <div class="shot-list">
          @for (shot of currentProject.shots; track shot.id) {
            <app-shot-card [shot]="shot"></app-shot-card>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 28px;
      }

      .project-detail {
        max-width: 1100px;
        margin: 0 auto;
      }

      .project-detail__head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-end;
        margin-bottom: 18px;
      }

      .project-detail__eyebrow {
        margin: 0 0 8px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 0.78rem;
        color: #8a5a18;
      }

      .project-detail__head h1,
      .project-detail__head p {
        margin: 0;
      }

      .project-detail__head p:last-child {
        margin-top: 8px;
        color: #5b6573;
      }

      .project-detail__actions {
        display: flex;
        gap: 10px;
      }

      .project-detail__actions a {
        padding: 10px 14px;
        border-radius: 999px;
        text-decoration: none;
        color: #1f2937;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(24, 30, 44, 0.08);
      }

      .summary-card,
      .state-card {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        padding: 20px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(24, 30, 44, 0.08);
      }

      .summary-card strong {
        display: block;
        font-size: 1.05rem;
      }

      .summary-card p {
        margin: 6px 0 0;
        color: #5b6573;
      }

      .shot-list {
        display: grid;
        gap: 14px;
        margin-top: 16px;
      }

      .state-card--error {
        color: #b42318;
      }
    `,
  ],
})
export class ProjectDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly videoAgentService = inject(VideoAgentService);
  private readonly subscriptions = new Subscription();

  protected readonly project = signal<VideoProjectDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly lastEvent = signal('');

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (!projectId) {
      this.error.set('缺少项目 ID');
      this.loading.set(false);
      return;
    }

    this.loadProject(projectId);
    this.subscriptions.add(
      this.videoAgentService.streamProject(projectId).subscribe({
        next: (event) => {
          this.lastEvent.set(this.describeEvent(event));
          this.loadProject(projectId, false);
        },
      }),
    );
    this.subscriptions.add(
      interval(5_000).subscribe(() => {
        const project = this.project();
        if (!project || this.isTerminalProject(project.status)) {
          return;
        }
        this.loadProject(projectId, false);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected statusLabel(status: VideoProjectDto['status']): string {
    switch (status) {
      case 'planning':
        return '规划中';
      case 'generating':
        return '生成中';
      case 'done':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return status;
    }
  }

  private loadProject(projectId: string, showLoading = true): void {
    if (showLoading) {
      this.loading.set(true);
    }
    this.subscriptions.add(
      this.videoAgentService.getProject(projectId).subscribe({
        next: (project) => {
          this.project.set(project);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(error instanceof Error ? error.message : '加载项目失败');
          this.loading.set(false);
        },
      }),
    );
  }

  private describeEvent(event: VideoAgentEvent): string {
    switch (event.type) {
      case 'project_state':
        return `项目 ${this.statusLabel(event.status)} · ${event.progress}%`;
      case 'planning':
        return event.message;
      case 'shot_queued':
        return `分镜 ${event.shotIndex} 已入队`;
      case 'shot_generating':
        return `分镜 ${event.shotIndex} 生成中`;
      case 'shot_done':
        return `分镜 ${event.shotIndex} 已完成`;
      case 'shot_failed':
        return `分镜 ${event.shotIndex} 失败`;
      case 'project_done':
        return '项目已完成';
      case 'project_failed':
        return `项目失败：${event.error}`;
      default:
        return '收到新事件';
    }
  }

  private isTerminalProject(status: VideoProjectDto['status']): boolean {
    return status === 'done' || status === 'failed';
  }
}
