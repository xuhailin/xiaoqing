import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { VideoProjectDto } from '../../../core/models/video-agent.models';
import { VideoAgentService } from '../../../core/services/video-agent.service';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="project-list">
      <header class="project-list__head">
        <div>
          <p class="project-list__eyebrow">History</p>
          <h1>视频项目</h1>
          <p>查看规划状态、分镜数量和最终进度。</p>
        </div>
        <a routerLink="/video/projects/new">新建项目</a>
      </header>

      @if (loading()) {
        <p class="state-card">正在加载项目...</p>
      } @else if (error()) {
        <p class="state-card state-card--error">{{ error() }}</p>
      } @else if (projects().length === 0) {
        <p class="state-card">还没有项目，先去创建一个。</p>
      } @else {
        <div class="project-list__grid">
          @for (project of projects(); track project.id) {
            <a class="project-card" [routerLink]="['/video/projects', project.id]">
              <div class="project-card__head">
                <div>
                  <p>{{ project.packageName }}</p>
                  <h2>{{ project.storyBrief || '未填写故事概要' }}</h2>
                </div>
                <span class="project-card__status">{{ statusLabel(project.status) }}</span>
              </div>
              <div class="project-card__meta">
                <span>{{ project.shots.length }} 个分镜</span>
                <span>进度 {{ project.progress }}%</span>
                <span>{{ project.createdAt | slice:0:16 }}</span>
              </div>
            </a>
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

      .project-list {
        max-width: 1100px;
        margin: 0 auto;
      }

      .project-list__head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-end;
        margin-bottom: 18px;
      }

      .project-list__eyebrow {
        margin: 0 0 8px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 0.78rem;
        color: #8a5a18;
      }

      .project-list__head h1,
      .project-list__head p {
        margin: 0;
      }

      .project-list__head p:last-child {
        margin-top: 8px;
        color: #5b6573;
      }

      .project-list__head a {
        padding: 11px 16px;
        border-radius: 999px;
        background: #1f2937;
        color: #fff;
        text-decoration: none;
      }

      .project-list__grid {
        display: grid;
        gap: 14px;
      }

      .project-card,
      .state-card {
        display: block;
        padding: 20px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(24, 30, 44, 0.08);
        text-decoration: none;
        color: inherit;
      }

      .project-card__head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
      }

      .project-card__head p {
        margin: 0 0 6px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 0.76rem;
        color: #8a5a18;
      }

      .project-card__head h2 {
        margin: 0;
        font-size: 1rem;
        line-height: 1.5;
      }

      .project-card__status {
        white-space: nowrap;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(24, 30, 44, 0.06);
        color: #445066;
        font-size: 0.78rem;
      }

      .project-card__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
        color: #5b6573;
      }

      .state-card--error {
        color: #b42318;
      }
    `,
  ],
})
export class ProjectListComponent implements OnInit {
  private readonly videoAgentService = inject(VideoAgentService);

  protected readonly projects = signal<VideoProjectDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.videoAgentService.listProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : '加载项目失败');
        this.loading.set(false);
      },
    });
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
}
