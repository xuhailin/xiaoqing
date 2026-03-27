import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { CreativePackageDto } from '../../../core/models/video-agent.models';
import { VideoAgentService } from '../../../core/services/video-agent.service';

@Component({
  selector: 'app-project-new',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="project-new">
      <header class="project-new__head">
        <div>
          <p class="project-new__eyebrow">New Project</p>
          <h1>发起视频项目</h1>
          <p>从资料包出发，让系统自动规划并批量执行分镜。</p>
        </div>
        <a routerLink="/video/projects">查看历史项目</a>
      </header>

      @if (loading()) {
        <p class="state-card">正在加载资料包...</p>
      } @else if (error()) {
        <p class="state-card state-card--error">{{ error() }}</p>
      } @else {
        <div class="project-new__panel">
          <div class="project-new__packages">
            @for (pkg of packages(); track pkg.id) {
              <button
                type="button"
                class="package-option"
                [class.package-option--active]="selectedPackageId() === pkg.id"
                (click)="selectedPackageId.set(pkg.id)"
              >
                <span>{{ pkg.name }}</span>
                <small>{{ pkg.description || '无描述' }}</small>
              </button>
            }
          </div>

          <label>
            故事概要
            <textarea
              [(ngModel)]="storyBrief"
              name="storyBrief"
              rows="6"
              placeholder="例如：雨夜中的都市猎人追踪一枚失控芯片，最后在霓虹街巷完成交接。"
            ></textarea>
          </label>

          <button
            type="button"
            class="project-new__submit"
            [disabled]="!selectedPackageId() || submitting()"
            (click)="submit()"
          >
            {{ submitting() ? '创建中...' : '开始生成' }}
          </button>
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

      .project-new {
        max-width: 980px;
        margin: 0 auto;
      }

      .project-new__head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-end;
        margin-bottom: 18px;
      }

      .project-new__eyebrow {
        margin: 0 0 8px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 0.78rem;
        color: #8a5a18;
      }

      .project-new__head h1,
      .project-new__head p {
        margin: 0;
      }

      .project-new__head p {
        color: #5b6573;
        margin-top: 8px;
      }

      .project-new__panel,
      .state-card {
        display: grid;
        gap: 18px;
        padding: 22px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(24, 30, 44, 0.08);
      }

      .project-new__packages {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }

      .package-option {
        display: grid;
        gap: 6px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(24, 30, 44, 0.12);
        background: rgba(248, 242, 232, 0.55);
        text-align: left;
        cursor: pointer;
      }

      .package-option--active {
        border-color: #8a5a18;
        background: rgba(245, 208, 138, 0.24);
      }

      label {
        display: grid;
        gap: 8px;
        font-weight: 600;
        color: #334155;
      }

      textarea {
        width: 100%;
        min-height: 160px;
        padding: 14px;
        border-radius: 18px;
        border: 1px solid rgba(24, 30, 44, 0.12);
        font: inherit;
        box-sizing: border-box;
      }

      .project-new__submit {
        justify-self: flex-start;
        padding: 12px 18px;
        border-radius: 999px;
        border: 0;
        background: #1f2937;
        color: #fff;
        cursor: pointer;
        font: inherit;
      }

      .state-card--error {
        color: #b42318;
      }
    `,
  ],
})
export class ProjectNewComponent implements OnInit {
  private readonly videoAgentService = inject(VideoAgentService);
  private readonly router = inject(Router);

  protected readonly packages = signal<CreativePackageDto[]>([]);
  protected readonly selectedPackageId = signal('');
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected storyBrief = '';

  ngOnInit(): void {
    this.videoAgentService.listPackages().subscribe({
      next: (packages) => {
        this.packages.set(packages);
        this.selectedPackageId.set(packages[0]?.id ?? '');
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : '加载资料包失败');
        this.loading.set(false);
      },
    });
  }

  protected submit(): void {
    const packageId = this.selectedPackageId();
    if (!packageId) {
      return;
    }

    this.submitting.set(true);
    this.videoAgentService
      .createProject({
        packageId,
        storyBrief: this.storyBrief.trim() || undefined,
      })
      .subscribe({
        next: (project) => {
          this.submitting.set(false);
          void this.router.navigate(['/video/projects', project.id]);
        },
        error: (error: unknown) => {
          this.error.set(error instanceof Error ? error.message : '创建项目失败');
          this.submitting.set(false);
        },
      });
  }
}
