import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { VideoService, type VideoTask } from '../../../core/services/video.service';

type VideoMode = 'text' | 'image' | 'keyframe';

interface ModeCard {
  id: VideoMode;
  title: string;
  desc: string;
  badge: string;
}

@Component({
  selector: 'app-seeddance-home',
  standalone: true,
  imports: [],
  template: `
    <div class="home">

      <!-- Header -->
      <header class="home-header">
        <div class="home-header__brand">
          <div class="brand-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" fill="url(#brandGrad)" opacity="0.9"/>
              <path d="M7 10l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <defs>
                <linearGradient id="brandGrad" x1="2" y1="2" x2="18" y2="18" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#c084fc"/>
                  <stop offset="1" stop-color="#818cf8"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span class="brand-name">小晴<em>·创作</em></span>
        </div>
        <div class="home-header__meta">
          <span class="model-tag">Seedance 1.0 Pro</span>
        </div>
      </header>

      <!-- Hero -->
      <section class="hero">
        <div class="hero__eyebrow">AI 视频生成</div>
        <h1 class="hero__title">将想象变成视频</h1>
        <p class="hero__sub">用文字描述，或上传参考图，AI 为你生成流畅的视频内容</p>
      </section>

      <!-- Mode cards -->
      <section class="modes">
        @for (card of modeCards; track card.id) {
          <button
            type="button"
            class="mode-card"
            [class.mode-card--active]="hoveredMode() === card.id"
            (mouseenter)="hoveredMode.set(card.id)"
            (mouseleave)="hoveredMode.set(null)"
            (click)="goCreate(card.id)"
          >
            <div class="mode-card__icon">
              @if (card.id === 'text') {
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="4" y="7" width="20" height="3" rx="1.5" fill="currentColor" opacity="0.9"/>
                  <rect x="4" y="13" width="14" height="3" rx="1.5" fill="currentColor" opacity="0.6"/>
                  <rect x="4" y="19" width="17" height="3" rx="1.5" fill="currentColor" opacity="0.4"/>
                  <circle cx="22" cy="20.5" r="4" fill="url(#textGrad)" opacity="0.85"/>
                  <path d="M20.5 20.5l1 1 2-2" stroke="white" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  <defs>
                    <linearGradient id="textGrad" x1="18" y1="17" x2="26" y2="24" gradientUnits="userSpaceOnUse">
                      <stop stop-color="#c084fc"/>
                      <stop offset="1" stop-color="#818cf8"/>
                    </linearGradient>
                  </defs>
                </svg>
              }
              @if (card.id === 'image') {
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
                  <circle cx="8.5" cy="10" r="2" fill="currentColor" opacity="0.5"/>
                  <path d="M3 15l5-4 4 3 3-2 6 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
                  <path d="M19 14l5 0M22 11l0 6" stroke="url(#imgGrad)" stroke-width="1.8" stroke-linecap="round"/>
                  <defs>
                    <linearGradient id="imgGrad" x1="19" y1="11" x2="24" y2="20" gradientUnits="userSpaceOnUse">
                      <stop stop-color="#c084fc"/>
                      <stop offset="1" stop-color="#e879f9"/>
                    </linearGradient>
                  </defs>
                </svg>
              }
              @if (card.id === 'keyframe') {
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="2" y="7" width="10" height="14" rx="2" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
                  <rect x="16" y="7" width="10" height="14" rx="2" stroke="url(#kfGrad)" stroke-width="1.5"/>
                  <path d="M12 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="1.5 1.5" opacity="0.5"/>
                  <circle cx="14" cy="14" r="1.5" fill="url(#kfGrad)"/>
                  <defs>
                    <linearGradient id="kfGrad" x1="16" y1="7" x2="26" y2="21" gradientUnits="userSpaceOnUse">
                      <stop stop-color="#c084fc"/>
                      <stop offset="1" stop-color="#818cf8"/>
                    </linearGradient>
                  </defs>
                </svg>
              }
            </div>
            <div class="mode-card__body">
              <div class="mode-card__title">{{ card.title }}</div>
              <div class="mode-card__desc">{{ card.desc }}</div>
            </div>
            <div class="mode-card__badge">{{ card.badge }}</div>
            <div class="mode-card__arrow">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </button>
        }
      </section>

      <!-- History -->
      <section class="history">
        <div class="history__head">
          <span class="history__title">最近生成</span>
          <span class="history__hint">{{ history().length ? history().length + ' 条记录' : '提交任务后会在这里留下记录' }}</span>
        </div>

        @if (loadError()) {
          <div class="history__empty">
            <p class="empty-text">{{ loadError() }}</p>
            <p class="empty-sub">稍后刷新页面再试，或重新提交任务。</p>
          </div>
        } @else if (loading()) {
          <div class="history__empty">
            <p class="empty-text">正在加载历史…</p>
            <p class="empty-sub">视频记录已切换为服务端持久化。</p>
          </div>
        } @else if (history().length === 0) {
          <div class="history__empty">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="1.5" opacity="0.15"/>
                <path d="M16 28l3-3 4 4 4-5 5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
                <circle cx="19" cy="20" r="2.5" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                <path d="M32 16l2 2-2 2M34 18h-5" stroke="url(#emptyGrad)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <defs>
                  <linearGradient id="emptyGrad" x1="29" y1="16" x2="36" y2="20" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#c084fc"/>
                    <stop offset="1" stop-color="#818cf8"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <p class="empty-text">开始你的第一次创作</p>
            <p class="empty-sub">选择上方任意模式，AI 会在几十秒内为你生成视频</p>
          </div>
        } @else {
          <div class="history__list">
            @for (item of history(); track item.taskId) {
              <div class="history-card" [class.history-card--completed]="item.status === 'completed'"
                   (click)="item.videoUrl && openVideo(item.videoUrl)">
                <div class="history-card__thumb">
                  @if (item.status === 'completed' && item.videoUrl) {
                    <video class="history-card__video" [src]="item.videoUrl" muted preload="metadata"></video>
                    <div class="history-card__play">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M5 3.5l8 4.5-8 4.5V3.5z" fill="currentColor"/>
                      </svg>
                    </div>
                  } @else {
                    <div class="history-card__status-icon">
                      @if (item.status === 'failed' || item.status === 'cancelled') {
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.3" opacity="0.5"/>
                          <path d="M10 6v5M10 13v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                      } @else {
                        <div class="mini-spinner"></div>
                      }
                    </div>
                  }
                </div>
                <div class="history-card__body">
                  <p class="history-card__prompt">{{ item.prompt }}</p>
                  <div class="history-card__meta">
                    <span class="status-badge status-badge--{{ item.status }}">{{ statusLabel(item.status) }}</span>
                    <span class="history-card__params">{{ item.resolution || '默认清晰度' }} · {{ item.aspectRatio || '默认比例' }}</span>
                    <span class="history-card__time">{{ timeAgo(item.createdAt) }}</span>
                  </div>
                </div>
                @if (item.status === 'completed' && item.videoUrl) {
                  <a class="history-card__dl" [href]="item.videoUrl" download target="_blank" rel="noreferrer"
                     (click)="$event.stopPropagation()">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 2v7M4 7l2.5 2.5L9 7M2 11h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </a>
                }
              </div>
            }
          </div>
        }
      </section>

    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
      padding: var(--workbench-shell-padding);
      background: var(--workbench-shell-background);
      overflow-y: auto;
    }

    .home {
      max-width: 860px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      padding-block: var(--space-4);
      min-height: min-content;
    }

    /* ── Header ── */
    .home-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .home-header__brand {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .brand-icon {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--color-primary) 14%, var(--color-surface));
      border: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-name {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      letter-spacing: 0.01em;
    }

    .brand-name em {
      font-style: normal;
      color: var(--color-text-secondary);
      font-weight: var(--font-weight-normal);
    }

    .model-tag {
      font-size: var(--font-size-xs);
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, #c084fc 10%, var(--color-surface));
      border: 1px solid color-mix(in srgb, #c084fc 22%, transparent);
      color: #c084fc;
      font-weight: var(--font-weight-medium);
    }

    /* ── Hero ── */
    .hero {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding-block: var(--space-4);
    }

    .hero__eyebrow {
      font-size: var(--font-size-xs);
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #c084fc;
      font-weight: var(--font-weight-medium);
    }

    .hero__title {
      margin: 0;
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: var(--font-weight-bold);
      line-height: 1.08;
      color: var(--color-text);
      background: linear-gradient(135deg, var(--color-text) 30%, color-mix(in srgb, #c084fc 60%, var(--color-text)));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero__sub {
      margin: 0;
      max-width: 52ch;
      color: var(--color-text-secondary);
      line-height: 1.7;
      font-size: var(--font-size-md);
    }

    /* ── Mode cards ── */
    .modes {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .mode-card {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      border-radius: var(--radius-xl);
      border: 1px solid var(--color-border-light);
      background: var(--color-panel-subtle-bg);
      backdrop-filter: blur(12px);
      cursor: pointer;
      text-align: left;
      transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease, background 200ms ease;
      width: 100%;
    }

    .mode-card:hover,
    .mode-card--active {
      border-color: color-mix(in srgb, #c084fc 40%, var(--color-border));
      background: color-mix(in srgb, #c084fc 6%, var(--color-panel-subtle-bg));
      transform: translateY(-2px);
      box-shadow: 0 12px 32px color-mix(in srgb, #c084fc 12%, transparent),
                  var(--shadow-sm);
    }

    .mode-card__icon {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
      background: color-mix(in srgb, #c084fc 10%, var(--color-surface));
      border: 1px solid color-mix(in srgb, #c084fc 18%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary);
      flex-shrink: 0;
      transition: background 200ms ease, border-color 200ms ease;
    }

    .mode-card:hover .mode-card__icon,
    .mode-card--active .mode-card__icon {
      background: color-mix(in srgb, #c084fc 16%, var(--color-surface));
      border-color: color-mix(in srgb, #c084fc 28%, transparent);
    }

    .mode-card__body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .mode-card__title {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .mode-card__desc {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }

    .mode-card__badge {
      font-size: var(--font-size-xs);
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
      border: 1px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
      color: var(--color-primary);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .mode-card__arrow {
      color: var(--color-text-muted);
      flex-shrink: 0;
      transition: transform 200ms ease, color 200ms ease;
    }

    .mode-card:hover .mode-card__arrow,
    .mode-card--active .mode-card__arrow {
      transform: translateX(3px);
      color: #c084fc;
    }

    /* ── History ── */
    .history {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .history__head {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
    }

    .history__title {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .history__hint {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }

    .history__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-6) var(--space-5);
      border-radius: var(--radius-xl);
      border: 1px dashed var(--color-border-light);
      background: color-mix(in srgb, var(--color-surface) 40%, transparent);
    }

    .empty-icon {
      color: var(--color-text-muted);
      margin-bottom: var(--space-1);
    }

    .empty-text {
      margin: 0;
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
    }

    .empty-sub {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      text-align: center;
      max-width: 40ch;
      line-height: 1.6;
    }

    /* ── History list ── */
    .history__list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .history-card {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border-light);
      background: color-mix(in srgb, var(--color-surface) 60%, transparent);
      transition: border-color 160ms ease, background 160ms ease;
      cursor: default;
    }

    .history-card--completed {
      cursor: pointer;
    }

    .history-card--completed:hover {
      border-color: color-mix(in srgb, #c084fc 30%, var(--color-border));
      background: color-mix(in srgb, #c084fc 4%, var(--color-surface));
    }

    .history-card__thumb {
      width: 72px;
      height: 48px;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--color-border) 40%, transparent);
      overflow: hidden;
      flex-shrink: 0;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .history-card__video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .history-card__play {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.3);
      color: #fff;
      opacity: 0;
      transition: opacity 160ms ease;
    }

    .history-card--completed:hover .history-card__play {
      opacity: 1;
    }

    .history-card__status-icon {
      color: var(--color-text-muted);
    }

    .mini-spinner {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, #c084fc 30%, var(--color-border));
      border-top-color: #c084fc;
      animation: spin 700ms linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .history-card__body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .history-card__prompt {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .history-card__meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .status-badge {
      font-size: var(--font-size-xs);
      padding: 1px 7px;
      border-radius: var(--radius-pill);
      font-weight: var(--font-weight-medium);
    }

    .status-badge--completed {
      background: color-mix(in srgb, #34d399 12%, transparent);
      color: #34d399;
      border: 1px solid color-mix(in srgb, #34d399 25%, transparent);
    }

    .status-badge--failed {
      background: var(--color-error-bg);
      color: var(--color-error);
      border: 1px solid var(--color-error-border);
    }

    .status-badge--pending,
    .status-badge--running {
      background: color-mix(in srgb, #c084fc 10%, transparent);
      color: #c084fc;
      border: 1px solid color-mix(in srgb, #c084fc 22%, transparent);
    }

    .history-card__params {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .history-card__time {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      margin-left: auto;
    }

    .history-card__dl {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border-light);
      color: var(--color-text-secondary);
      text-decoration: none;
      transition: background 160ms ease, color 160ms ease;
    }

    .history-card__dl:hover {
      background: color-mix(in srgb, var(--color-primary) 8%, transparent);
      color: var(--color-primary);
    }

    @media (max-width: 768px) {
      :host {
        padding: var(--workbench-shell-padding-mobile);
      }

      .mode-card {
        padding: var(--space-3) var(--space-4);
      }

      .mode-card__badge {
        display: none;
      }
    }
  `],
})
export class SeedanceHomeComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly videoService = inject(VideoService);

  protected readonly hoveredMode = signal<VideoMode | null>(null);
  protected readonly history = signal<VideoTask[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly modeCards: ModeCard[] = [
    {
      id: 'text',
      title: '文生视频',
      desc: '用文字描述画面、运动和氛围，AI 生成对应视频',
      badge: '推荐',
    },
    {
      id: 'image',
      title: '图生视频',
      desc: '上传一张图片，AI 赋予它动感与生命',
      badge: '图转视频',
    },
    {
      id: 'keyframe',
      title: '首尾帧控制',
      desc: '定义起始画面和结束画面，AI 填充中间的过渡',
      badge: '精准控制',
    },
  ];

  ngOnInit(): void {
    this.loadHistory();
  }

  protected goCreate(mode: VideoMode): void {
    void this.router.navigate(['/video/create'], {
      queryParams: { mode },
    });
  }

  protected openVideo(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  protected statusLabel(status: VideoTask['status']): string {
    const map: Record<VideoTask['status'], string> = {
      pending: '排队中',
      running: '生成中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
    };
    return map[status];
  }

  protected timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    return `${Math.floor(h / 24)} 天前`;
  }

  private loadHistory(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.videoService.listTasks().subscribe({
      next: (tasks) => {
        this.history.set(tasks);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(this.describeError(err, '加载历史失败'));
      },
    });
  }

  private describeError(err: unknown, fallback: string): string {
    if (typeof err === 'string' && err.trim()) return err;
    if (err && typeof err === 'object') {
      const e = err as { message?: string; error?: { message?: string } };
      if (e.error?.message) return e.error.message;
      if (e.message) return e.message;
    }
    return fallback;
  }
}
