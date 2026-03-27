import { Component, OnInit, inject, signal } from '@angular/core';
import { VideoWorkbenchService } from '../../core/services/video-workbench.service';
import type { WorkbenchHistoryItem } from '../../core/models/video-workbench.models';

@Component({
  selector: 'app-video-history-panel',
  standalone: true,
  imports: [],
  template: `
    <section class="history-panel">
      <header class="history-panel__head">
        <div class="history-panel__copy">
          <p class="history-panel__eyebrow">History</p>
          <h2>单视频与项目查看</h2>
          <p class="history-panel__description">回看已经生成的视频、分镜项目和最近一次创作状态，只保留真正需要反复查看的结果区。</p>
        </div>
        <button type="button" class="history-panel__refresh" (click)="reload()">刷新</button>
      </header>

      @if (loading()) {
        <div class="history-panel__state">
          <span class="history-panel__state-title">正在加载历史记录…</span>
          <span class="history-panel__state-text">单视频和项目记录会整理成一条统一时间流。</span>
        </div>
      } @else if (error()) {
        <div class="history-panel__state history-panel__state--error">
          <span class="history-panel__state-title">加载历史失败</span>
          <span class="history-panel__state-text">{{ error() }}</span>
        </div>
      } @else if (items().length === 0) {
        <div class="history-panel__state">
          <span class="history-panel__state-title">还没有历史记录</span>
          <span class="history-panel__state-text">先去创作页发起一条任务，生成结果后就会出现在这里。</span>
        </div>
      } @else {
        <div class="history-list">
          @for (item of items(); track item.id) {
            <details class="history-item" [open]="item.type === 'single'">
              <summary>
                <div class="history-item__summary">
                  <p>{{ item.type === 'storyboard' ? 'Project' : 'Single render' }}</p>
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.subtitle }}</span>
                </div>
                <div class="history-item__meta">
                  <span class="history-badge" [attr.data-status]="item.status">
                    {{ statusLabel(item.status) }}
                  </span>
                  <span>{{ formatTime(item.createdAt) }}</span>
                </div>
              </summary>

              <div class="history-item__scenes">
                @for (scene of item.scenes; track scene.id; let idx = $index) {
                  <article class="scene-row">
                    <div>
                      <strong>{{ item.type === 'storyboard' ? 'Scene ' + (idx + 1) : 'Output' }}</strong>
                      <p>{{ scene.description || scene.prompt }}</p>
                    </div>
                    <div class="scene-row__meta">
                      <span class="history-badge" [attr.data-status]="scene.status || 'pending'">
                        {{ statusLabel(scene.status || 'pending') }}
                      </span>
                      @if (scene.videoUrl) {
                        <a [href]="scene.videoUrl" target="_blank" rel="noreferrer">打开视频</a>
                      }
                    </div>
                  </article>
                }
              </div>
            </details>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .history-panel {
        display: grid;
        gap: 18px;
        padding: clamp(22px, 3vw, 30px);
        border-radius: 32px;
        border: 1px solid rgba(220, 226, 241, 0.88);
        background:
          radial-gradient(circle at 0% 0%, rgba(255, 232, 240, 0.5), transparent 24%),
          radial-gradient(circle at 100% 0%, rgba(232, 239, 255, 0.66), transparent 28%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 255, 0.94));
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.72),
          0 20px 48px rgba(158, 170, 194, 0.14);
      }

      .history-panel__head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }

      .history-panel__eyebrow {
        margin: 0 0 8px;
        font-size: 0.82rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #ac81ff;
      }

      .history-panel__copy h2 {
        margin: 0 0 10px;
        color: #172033;
        font-size: clamp(1.65rem, 3vw, 2.2rem);
        line-height: 1.08;
        letter-spacing: -0.03em;
      }

      .history-panel__description {
        margin: 0;
        max-width: 58ch;
        color: #6f7d97;
        line-height: 1.7;
      }

      .history-panel__refresh {
        min-height: 2.5rem;
        padding: 0 14px;
        border: 1px solid rgba(207, 215, 235, 0.96);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.84);
        color: #5c6982;
        cursor: pointer;
        font: inherit;
        transition:
          transform 180ms ease,
          background 180ms ease,
          border-color 180ms ease,
          box-shadow 180ms ease;
      }

      .history-panel__refresh:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.96);
        border-color: rgba(188, 198, 228, 1);
        box-shadow: 0 12px 24px rgba(170, 180, 205, 0.14);
      }

      .history-panel__state {
        display: grid;
        gap: 6px;
        padding: 18px 20px;
        border-radius: 22px;
        background: rgba(252, 253, 255, 0.8);
        color: #687590;
        border: 1px dashed rgba(207, 214, 235, 0.96);
      }

      .history-panel__state--error {
        border-color: rgba(231, 171, 171, 0.92);
        background: rgba(255, 244, 244, 0.88);
        color: #b45b60;
      }

      .history-panel__state-title {
        color: #1f2941;
        font-weight: 600;
      }

      .history-panel__state-text {
        line-height: 1.7;
      }

      .history-list {
        display: grid;
        gap: 14px;
      }

      .history-item {
        padding: 18px 20px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.84);
        border: 1px solid rgba(220, 226, 241, 0.92);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.9),
          0 14px 32px rgba(176, 186, 208, 0.12);
      }

      .history-item summary {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        list-style: none;
        cursor: pointer;
      }

      .history-item summary::-webkit-details-marker {
        display: none;
      }

      .history-item__summary {
        display: grid;
        gap: 6px;
      }

      .history-item summary p,
      .history-item summary span {
        margin: 0;
        color: #7a879f;
      }

      .history-item summary strong {
        display: block;
        margin: 2px 0;
        color: #192236;
      }

      .history-item__meta {
        display: grid;
        justify-items: end;
        gap: 6px;
      }

      .history-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 28px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(220, 226, 241, 0.96);
        background: rgba(247, 249, 255, 0.94);
        color: #55627c;
        font-size: var(--font-size-xs);
      }

      .history-badge[data-status='done'],
      .history-badge[data-status='completed'] {
        background: rgba(229, 247, 233, 0.96);
        border-color: rgba(186, 226, 196, 0.96);
        color: #3d8f56;
      }

      .history-badge[data-status='generating'],
      .history-badge[data-status='running'],
      .history-badge[data-status='pending'] {
        background: rgba(243, 237, 255, 0.96);
        border-color: rgba(221, 207, 255, 0.96);
        color: #8b66df;
      }

      .history-badge[data-status='failed'],
      .history-badge[data-status='cancelled'] {
        background: rgba(255, 240, 240, 0.96);
        border-color: rgba(241, 204, 204, 0.96);
        color: #c56a6f;
      }

      .history-item__scenes {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }

      .scene-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 14px;
        border-radius: 18px;
        background: rgba(250, 251, 255, 0.88);
        border: 1px solid rgba(224, 230, 244, 0.96);
      }

      .scene-row strong {
        color: #1d2539;
      }

      .scene-row p {
        margin: 6px 0 0;
        color: #66748d;
        line-height: 1.6;
      }

      .scene-row__meta {
        display: grid;
        gap: 6px;
        justify-items: end;
      }

      .scene-row__meta a {
        color: #6d63f8;
        text-decoration: none;
        font-weight: 600;
      }

      @media (max-width: 720px) {
        .history-panel__head,
        .history-item summary,
        .scene-row {
          grid-template-columns: 1fr;
          display: grid;
        }

        .history-panel__refresh {
          width: 100%;
        }

        .history-item__meta,
        .scene-row__meta {
          justify-items: start;
        }
      }
    `,
  ],
})
export class VideoHistoryPanelComponent implements OnInit {
  private readonly workbenchService = inject(VideoWorkbenchService);

  protected readonly items = signal<WorkbenchHistoryItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.workbenchService.loadHistory().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : '加载历史失败');
        this.loading.set(false);
      },
    });
  }

  protected formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'done':
      case 'completed':
        return '已完成';
      case 'generating':
      case 'running':
        return '生成中';
      case 'failed':
        return '失败';
      case 'cancelled':
        return '已取消';
      case 'pending':
      default:
        return '排队中';
    }
  }
}
