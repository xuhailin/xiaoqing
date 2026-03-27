import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { CreativePackageDto } from '../../core/models/video-agent.models';
import { VideoWorkbenchService } from '../../core/services/video-workbench.service';
import { AppIconComponent } from '../../shared/ui/app-icon.component';

@Component({
  selector: 'app-video-assets-panel',
  standalone: true,
  imports: [AppIconComponent],
  template: `
    <section class="assets-panel">
      <header class="assets-hero">
        <div class="assets-hero__brand">
          <span class="assets-hero__brand-badge">
            <app-icon name="layers" size="1rem" />
          </span>
          <div class="assets-hero__brand-copy">
            <span class="assets-hero__eyebrow">小晴·素材包</span>
            <h2>把场景素材收进统一创作系统</h2>
          </div>
        </div>
        <span class="assets-hero__tag">Asset System</span>
        <p class="assets-hero__description">
          这里延续创作首页的视觉和节奏，先把场景资料包整理成可直接复用的列表，角色组先预留结构。
        </p>
      </header>

      @if (message()) {
        <div class="assets-notice" [class.assets-notice--error]="isError()">
          <app-icon [name]="isError() ? 'alert' : 'info'" size="0.95rem" />
          <span>{{ message() }}</span>
        </div>
      }

      <div class="asset-groups">
        <section class="asset-group">
          <div class="asset-group__head">
            <div class="asset-group__title">
              <span class="asset-group__icon">
                <app-icon name="layers" size="1rem" />
              </span>
              <div>
                <h3>场景</h3>
                <p>对应资源包列表，保留编辑与删除能力，直接延续之前 studio 的资料包数据。</p>
              </div>
            </div>
            <button type="button" class="group-action group-action--primary" (click)="createScenePackage()">
              <app-icon name="plus" size="0.95rem" />
              <span>新增</span>
            </button>
          </div>

          @if (loading()) {
            <div class="asset-state">
              <span class="asset-state__title">正在加载场景列表…</span>
              <span class="asset-state__desc">已有资料包会在这里整理成统一的素材视图。</span>
            </div>
          } @else if (scenePackages().length === 0) {
            <div class="asset-state">
              <span class="asset-state__title">还没有场景素材</span>
              <span class="asset-state__desc">先新建一个场景资料包，后续创作和分镜都可以直接复用。</span>
            </div>
          } @else {
            <div class="asset-list">
              @for (pkg of scenePackages(); track pkg.id) {
                <article class="asset-row">
                  <div class="asset-row__main">
                    <div class="asset-row__topline">
                      <span class="asset-chip">{{ sourceLabel(pkg.source) }}</span>
                      <span class="asset-row__time">更新于 {{ formatDate(pkg.updatedAt) }}</span>
                    </div>
                    <div class="asset-row__title">{{ pkg.name }}</div>
                    <div class="asset-row__description">{{ pkg.description || '还没有补充描述，建议写一句这个场景包适合的世界观或镜头气质。' }}</div>
                    <div class="asset-row__meta">
                      <span>{{ keywordSummary(pkg) }}</span>
                      <span>{{ pkg.stylePreset.aspectRatio }} · {{ pkg.stylePreset.resolution }}</span>
                      <span>{{ pkg.stylePreset.duration }}s 默认时长</span>
                    </div>
                  </div>

                  <div class="asset-row__actions">
                    <button
                      type="button"
                      class="icon-action"
                      title="编辑场景资料包"
                      aria-label="编辑场景资料包"
                      (click)="editScenePackage(pkg)"
                    >
                      <app-icon name="tool" size="0.95rem" />
                    </button>
                    @if (canDelete(pkg)) {
                      <button
                        type="button"
                        class="icon-action icon-action--danger"
                        title="删除场景资料包"
                        aria-label="删除场景资料包"
                        (click)="removeScenePackage(pkg)"
                      >
                        <app-icon name="close" size="0.95rem" />
                      </button>
                    }
                  </div>
                </article>
              }
            </div>
          }
        </section>

        <section class="asset-group asset-group--muted">
          <div class="asset-group__head">
            <div class="asset-group__title">
              <span class="asset-group__icon asset-group__icon--secondary">
                <app-icon name="userCircle" size="1rem" />
              </span>
              <div>
                <h3>角色</h3>
                <p>先把分组结构预留好，后续会接入单独的角色素材和形象设定列表。</p>
              </div>
            </div>
            <button type="button" class="group-action" (click)="createCharacterPlaceholder()">
              <app-icon name="plus" size="0.95rem" />
              <span>新增</span>
            </button>
          </div>

          <div class="asset-state asset-state--soft">
            <span class="asset-state__title">角色列表暂时留空</span>
            <span class="asset-state__desc">先保留入口和版式，等角色资产结构确认后再接真实数据。</span>
          </div>
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .assets-panel {
        position: relative;
        display: grid;
        gap: 20px;
        padding: clamp(22px, 3vw, 32px);
        border-radius: 32px;
        overflow: hidden;
        border: 1px solid rgba(218, 224, 240, 0.88);
        background:
          radial-gradient(circle at 0% 0%, rgba(255, 230, 236, 0.78), transparent 28%),
          radial-gradient(circle at 100% 0%, rgba(232, 239, 255, 0.9), transparent 30%),
          radial-gradient(circle at 50% 100%, rgba(243, 234, 255, 0.7), transparent 34%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 255, 0.94));
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.68),
          0 24px 64px rgba(146, 157, 184, 0.16);
      }

      .assets-panel::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(120deg, rgba(255, 255, 255, 0.28), transparent 38%),
          linear-gradient(300deg, rgba(201, 213, 255, 0.16), transparent 34%);
      }

      .assets-hero,
      .asset-group,
      .assets-notice {
        position: relative;
        z-index: 1;
      }

      .assets-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 14px 18px;
        align-items: start;
      }

      .assets-hero__brand {
        display: flex;
        align-items: flex-start;
        gap: 14px;
      }

      .assets-hero__brand-badge,
      .asset-group__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 18px;
        border: 1px solid rgba(194, 173, 255, 0.4);
        background: linear-gradient(180deg, rgba(241, 237, 255, 0.98), rgba(233, 244, 255, 0.9));
        color: #7c6cff;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
      }

      .asset-group__icon--secondary {
        color: #7484b7;
      }

      .assets-hero__brand-copy,
      .asset-group__title {
        min-width: 0;
      }

      .assets-hero__eyebrow {
        display: block;
        margin-bottom: 8px;
        color: #ae83ff;
        font-size: 0.88rem;
        font-weight: 600;
        letter-spacing: 0.08em;
      }

      .assets-hero h2 {
        margin: 0;
        color: #151b2c;
        font-size: clamp(1.9rem, 4vw, 3rem);
        line-height: 1.04;
        letter-spacing: -0.04em;
      }

      .assets-hero__description {
        grid-column: 1 / -1;
        margin: 0;
        max-width: 56ch;
        color: #67758f;
        font-size: 1rem;
        line-height: 1.75;
      }

      .assets-hero__tag {
        align-self: start;
        display: inline-flex;
        align-items: center;
        min-height: 2.15rem;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(212, 194, 255, 0.72);
        background: rgba(255, 246, 255, 0.58);
        color: #b07cff;
        font-size: 0.95rem;
        font-weight: 600;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
      }

      .assets-notice {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 18px;
        border: 1px solid rgba(188, 205, 242, 0.68);
        background: rgba(246, 249, 255, 0.88);
        color: #55637d;
      }

      .assets-notice--error {
        border-color: rgba(232, 163, 163, 0.72);
        background: rgba(255, 244, 244, 0.92);
        color: #b25454;
      }

      .asset-groups {
        display: grid;
        gap: 18px;
      }

      .asset-group {
        display: grid;
        gap: 16px;
        padding: 20px;
        border-radius: 28px;
        border: 1px solid rgba(220, 226, 241, 0.88);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(250, 251, 255, 0.9)),
          rgba(255, 255, 255, 0.88);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.88),
          0 14px 36px rgba(161, 173, 197, 0.12);
      }

      .asset-group--muted {
        background:
          linear-gradient(180deg, rgba(252, 252, 255, 0.9), rgba(246, 248, 253, 0.92)),
          rgba(255, 255, 255, 0.86);
      }

      .asset-group__head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
      }

      .asset-group__title {
        display: flex;
        align-items: flex-start;
        gap: 14px;
      }

      .asset-group__title h3 {
        margin: 0 0 6px;
        color: #1a2236;
        font-size: 1.1rem;
      }

      .asset-group__title p {
        margin: 0;
        color: #72809b;
        line-height: 1.65;
      }

      .group-action {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 0 14px;
        min-height: 2.5rem;
        border: 1px solid rgba(206, 214, 234, 0.96);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.82);
        color: #5b6881;
        cursor: pointer;
        font: inherit;
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          box-shadow 180ms ease,
          background 180ms ease;
      }

      .group-action:hover {
        transform: translateY(-1px);
        border-color: rgba(190, 198, 228, 1);
        box-shadow: 0 12px 24px rgba(170, 180, 205, 0.14);
      }

      .group-action--primary {
        border-color: rgba(195, 207, 255, 0.88);
        background: linear-gradient(180deg, rgba(240, 245, 255, 0.94), rgba(247, 239, 255, 0.94));
        color: #5d72fb;
      }

      .asset-list {
        display: grid;
        gap: 12px;
      }

      .asset-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 14px;
        align-items: start;
        padding: 16px 18px;
        border-radius: 22px;
        border: 1px solid rgba(222, 228, 242, 0.92);
        background: rgba(255, 255, 255, 0.82);
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          box-shadow 180ms ease,
          background 180ms ease;
      }

      .asset-row:hover {
        transform: translateY(-1px);
        border-color: rgba(201, 208, 233, 1);
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 16px 32px rgba(176, 186, 208, 0.16);
      }

      .asset-row__main {
        display: grid;
        gap: 8px;
        min-width: 0;
      }

      .asset-row__topline,
      .asset-row__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 14px;
        align-items: center;
      }

      .asset-chip {
        display: inline-flex;
        align-items: center;
        min-height: 1.8rem;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(241, 235, 255, 0.88);
        color: #9a73e7;
        font-size: 0.82rem;
        font-weight: 600;
      }

      .asset-row__time,
      .asset-row__meta {
        color: #7a879f;
        font-size: 0.92rem;
      }

      .asset-row__title {
        color: #1b2438;
        font-size: 1.08rem;
        font-weight: 700;
      }

      .asset-row__description {
        color: #5c6882;
        line-height: 1.7;
      }

      .asset-row__actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .icon-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.4rem;
        height: 2.4rem;
        border: 1px solid rgba(212, 220, 239, 0.96);
        border-radius: 999px;
        background: rgba(249, 250, 255, 0.92);
        color: #6e7c98;
        cursor: pointer;
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          background 180ms ease,
          color 180ms ease;
      }

      .icon-action:hover {
        transform: translateY(-1px);
        border-color: rgba(188, 198, 228, 1);
        background: rgba(255, 255, 255, 1);
      }

      .icon-action--danger {
        color: #c26f74;
      }

      .asset-state {
        display: grid;
        gap: 6px;
        padding: 18px;
        border-radius: 22px;
        border: 1px dashed rgba(207, 214, 235, 0.96);
        background: rgba(252, 253, 255, 0.7);
      }

      .asset-state--soft {
        background: rgba(248, 250, 255, 0.82);
      }

      .asset-state__title {
        color: #1f2941;
        font-weight: 600;
      }

      .asset-state__desc {
        color: #7b879f;
        line-height: 1.7;
      }

      @media (max-width: 860px) {
        .assets-hero {
          grid-template-columns: 1fr;
        }

        .assets-hero__tag {
          justify-self: start;
        }

        .asset-group__head,
        .asset-row {
          grid-template-columns: 1fr;
        }

        .asset-group__head {
          align-items: stretch;
        }

        .group-action {
          justify-content: center;
        }

        .asset-row__actions {
          justify-content: flex-end;
        }
      }
    `,
  ],
})
export class VideoAssetsPanelComponent implements OnInit {
  private readonly workbenchService = inject(VideoWorkbenchService);
  private readonly router = inject(Router);

  protected readonly packages = signal<CreativePackageDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  protected readonly scenePackages = computed(() =>
    [...this.packages()].sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    ),
  );

  ngOnInit(): void {
    this.reload();
  }

  protected createScenePackage(): void {
    void this.router.navigate(['/video/assets/new']);
  }

  protected editScenePackage(pkg: CreativePackageDto): void {
    void this.router.navigate(['/video/assets', pkg.id, 'edit']);
  }

  protected createCharacterPlaceholder(): void {
    this.isError.set(false);
    this.message.set('角色组先保留结构，等角色素材模型确认后再接新增流程。');
  }

  protected removeScenePackage(pkg: CreativePackageDto): void {
    if (!this.canDelete(pkg)) {
      return;
    }

    const confirmed = window.confirm(`确定删除资料包「${pkg.name}」吗？`);
    if (!confirmed) {
      return;
    }

    this.isError.set(false);
    this.message.set('');
    this.workbenchService.deleteAsset(pkg.id).subscribe({
      next: () => {
        this.message.set(`已删除「${pkg.name}」`);
        this.reload();
      },
      error: (error: unknown) => {
        this.isError.set(true);
        this.message.set(error instanceof Error ? error.message : '删除资料包失败');
      },
    });
  }

  protected canDelete(pkg: CreativePackageDto): boolean {
    return pkg.source !== 'static';
  }

  protected sourceLabel(source: string): string {
    return source === 'static' ? '系统预置' : '场景包';
  }

  protected keywordSummary(pkg: CreativePackageDto): string {
    if (pkg.worldStyle.sceneKeywords.length) {
      return pkg.worldStyle.sceneKeywords.join(' · ');
    }

    return '暂无场景关键词';
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '刚刚';
    }

    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
    }).format(date);
  }

  private reload(): void {
    this.loading.set(true);
    this.isError.set(false);
    this.message.set('');
    this.workbenchService.loadAssets().subscribe({
      next: (packages) => {
        this.packages.set(packages);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.isError.set(true);
        this.message.set(error instanceof Error ? error.message : '加载资料包失败');
        this.loading.set(false);
      },
    });
  }
}
