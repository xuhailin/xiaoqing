import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { CreativePackageDto, VideoProjectDto } from '../../core/models/video-agent.models';
import type {
  WorkbenchCreateMode,
  WorkbenchScene,
} from '../../core/models/video-workbench.models';
import { VideoWorkbenchService } from '../../core/services/video-workbench.service';
import { VideoService, type VideoTask } from '../../core/services/video.service';

@Component({
  selector: 'app-video-create-panel',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="create-panel">
      <div class="create-panel__hero">
        <div>
          <p class="create-panel__eyebrow">Video Workbench</p>
          <h2>在一个地方完成视频创作的一切</h2>
          <p>文本、图片、分镜共用同一条创作链路，资料包只是在右侧切换的风格上下文。</p>
        </div>
        <div class="create-panel__mode-pills">
          @for (mode of modes; track mode) {
            <button
              type="button"
              [class.create-panel__mode-pill--active]="activeMode() === mode"
              (click)="setMode(mode)"
            >
              {{ modeLabel(mode) }}
            </button>
          }
        </div>
      </div>

      <div class="create-panel__layout">
        <div class="create-panel__main">
          @if (activeMode() === 'storyboard') {
            <section class="create-card">
              <label>
                故事输入
                <textarea
                  [(ngModel)]="storyPrompt"
                  name="storyPrompt"
                  rows="5"
                  placeholder="输入一个完整故事，AI 会拆成可编辑 scenes。"
                ></textarea>
              </label>
              <div class="create-panel__scene-actions">
                <button
                  type="button"
                  [disabled]="planningScenes() || !selectedPackageId() || !storyPrompt.trim()"
                  (click)="autoSplitScenes()"
                >
                  {{ planningScenes() ? '拆分中...' : 'AI 自动拆分 scenes' }}
                </button>
                <button type="button" (click)="addScene()">手动加一镜</button>
              </div>
              <div class="scene-list">
                @for (scene of scenes(); track scene.id; let idx = $index) {
                  <article class="scene-card">
                    <div class="scene-card__head">
                      <strong>Scene {{ idx + 1 }}</strong>
                      <button type="button" (click)="removeScene(scene.id)">删除</button>
                    </div>
                    <textarea
                      rows="3"
                      [ngModel]="scene.prompt"
                      (ngModelChange)="updateScene(scene.id, 'prompt', $event)"
                      placeholder="填写这一镜的视觉 prompt"
                    ></textarea>
                    <div class="scene-card__grid">
                      <input
                        type="number"
                        min="1"
                        [ngModel]="scene.duration || 5"
                        (ngModelChange)="updateScene(scene.id, 'duration', +$event)"
                        placeholder="时长"
                      />
                      <input
                        [ngModel]="scene.cameraMovement || ''"
                        (ngModelChange)="updateScene(scene.id, 'cameraMovement', $event)"
                        placeholder="镜头描述，可选"
                      />
                    </div>
                  </article>
                }
              </div>
            </section>
          } @else {
            <section class="create-card">
              <label>
                创作输入
                <textarea
                  [(ngModel)]="singlePrompt"
                  name="singlePrompt"
                  rows="6"
                  [placeholder]="activeMode() === 'image' ? '描述图片想要发生的动作与氛围' : '描述你想要生成的视频画面'"
                ></textarea>
              </label>
              @if (activeMode() === 'image') {
                <label class="upload-field">
                  参考图片
                  <input type="file" accept="image/*" (change)="handleReferenceUpload($event)" />
                </label>
                @if (referencePreview()) {
                  <img class="upload-preview" [src]="referencePreview()!" alt="参考图预览" />
                }
              }
            </section>
          }

          <section class="create-card create-card--controls">
            <label>
              画面比例
              <select [(ngModel)]="aspectRatio" name="aspectRatio">
                @for (ratio of aspectRatioOptions(); track ratio) {
                  <option [value]="ratio">{{ ratio }}</option>
                }
              </select>
            </label>
            <label>
              分辨率
              <select [(ngModel)]="resolution" name="resolution">
                @for (item of resolutionOptions(); track item) {
                  <option [value]="item">{{ item }}</option>
                }
              </select>
            </label>
            <label>
              时长（秒）
              <input [(ngModel)]="duration" name="duration" type="number" min="1" />
            </label>
          </section>
        </div>

        <aside class="create-panel__sidebar">
          <section class="sidebar-card">
            <p class="sidebar-card__eyebrow">Assets</p>
            <h3>资料包</h3>
            <div class="asset-list">
              @for (pkg of packages(); track pkg.id) {
                <button
                  type="button"
                  class="asset-list__item"
                  [class.asset-list__item--active]="selectedPackageId() === pkg.id"
                  (click)="selectedPackageId.set(pkg.id)"
                >
                  <strong>{{ pkg.name }}</strong>
                  <span>{{ pkg.description || '无描述' }}</span>
                </button>
              }
            </div>
            <a routerLink="/video/assets" class="sidebar-card__link">管理资料包</a>
          </section>

          @if (selectedPackage(); as pkg) {
            <section class="sidebar-card sidebar-card--accent">
              <p class="sidebar-card__eyebrow">Selected</p>
              <h3>{{ pkg.name }}</h3>
              <p>{{ pkg.description || '这个资料包会为当前创作注入角色、世界观和风格上下文。' }}</p>
              <div class="sidebar-card__chips">
                @for (keyword of pkg.worldStyle.sceneKeywords; track keyword) {
                  <span>{{ keyword }}</span>
                }
              </div>
            </section>
          }

          <section class="sidebar-card">
            <p class="sidebar-card__eyebrow">Result</p>
            <h3>最近生成</h3>
            @if (submitting()) {
              <p>正在提交任务，请稍候...</p>
            } @else if (lastStoryboardProject()) {
              <p>分镜项目已创建，去历史页查看完整进度。</p>
              <a routerLink="/video/history" class="sidebar-card__link">打开 History</a>
            } @else if (lastSingleTask()?.videoUrl) {
              <video class="result-video" [src]="lastSingleTask()!.videoUrl" controls preload="metadata"></video>
            } @else {
              <p>这里会显示你刚刚创建的任务结果。</p>
            }
          </section>
        </aside>
      </div>

      @if (error()) {
        <p class="create-panel__error">{{ error() }}</p>
      }

      <div class="create-panel__footer">
        <button
          type="button"
          class="create-panel__submit"
          [disabled]="!canSubmit()"
          (click)="submit()"
        >
          {{ submitting() ? '提交中...' : activeMode() === 'storyboard' ? '生成 storyboard 项目' : '生成单视频' }}
        </button>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .create-panel {
        display: grid;
        gap: 18px;
      }

      .create-panel__hero {
        display: grid;
        gap: 16px;
        padding: 24px;
        border-radius: 28px;
        border: 1px solid var(--studio-border, rgba(255, 255, 255, 0.12));
        background:
          radial-gradient(circle at top right, rgba(232, 121, 249, 0.22), transparent 30%),
          radial-gradient(circle at bottom left, rgba(79, 109, 245, 0.18), transparent 28%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
          var(--studio-surface-strong, rgba(20, 20, 32, 0.9));
        color: var(--studio-text, #f0edf6);
        box-shadow: var(--studio-shadow, 0 24px 64px rgba(6, 6, 12, 0.42));
        backdrop-filter: var(--studio-blur, blur(16px));
      }

      .create-panel__hero h2 {
        margin: 0 0 8px;
        font-size: clamp(2rem, 4vw, 3.4rem);
        line-height: 1.02;
      }

      .create-panel__hero p {
        margin: 0;
        line-height: 1.7;
        color: var(--studio-text-soft, rgba(240, 237, 246, 0.72));
      }

      .create-panel__eyebrow,
      .sidebar-card__eyebrow {
        margin: 0 0 8px;
        font-size: 0.78rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--studio-text-muted, rgba(240, 237, 246, 0.56));
      }

      .create-panel__mode-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .create-panel__mode-pills button,
      .create-panel__submit,
      .create-panel__scene-actions button,
      .asset-list__item,
      .sidebar-card__link,
      .scene-card__head button {
        border: 0;
        cursor: pointer;
        font: inherit;
      }

      .create-panel__mode-pills button {
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--studio-text-soft, rgba(240, 237, 246, 0.72));
        transition:
          transform 200ms ease,
          background 200ms ease,
          color 200ms ease,
          box-shadow 200ms ease;
      }

      .create-panel__mode-pills button:hover {
        transform: translateY(-2px);
        color: var(--studio-text, #f0edf6);
        background: rgba(255, 255, 255, 0.1);
      }

      .create-panel__mode-pill--active {
        background: linear-gradient(135deg, rgba(192, 132, 252, 0.2), rgba(79, 109, 245, 0.16)) !important;
        color: var(--studio-text, #f0edf6) !important;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }

      .create-panel__layout {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.85fr);
        gap: 18px;
      }

      .create-panel__main,
      .create-panel__sidebar {
        display: grid;
        gap: 16px;
      }

      .create-card,
      .sidebar-card {
        padding: 20px;
        border-radius: 24px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
          var(--studio-surface, rgba(17, 18, 28, 0.74));
        border: 1px solid var(--studio-border, rgba(255, 255, 255, 0.12));
        box-shadow: var(--studio-shadow, 0 24px 64px rgba(6, 6, 12, 0.42));
        backdrop-filter: var(--studio-blur, blur(16px));
      }

      .sidebar-card--accent {
        background:
          radial-gradient(circle at top right, rgba(232, 121, 249, 0.16), transparent 34%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
          var(--studio-surface, rgba(17, 18, 28, 0.74));
      }

      label {
        display: grid;
        gap: 8px;
        color: var(--studio-text, #f0edf6);
        font-weight: 600;
      }

      textarea,
      input,
      select {
        width: 100%;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        font: inherit;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.04);
        color: var(--studio-text, #f0edf6);
      }

      textarea::placeholder,
      input::placeholder {
        color: var(--studio-text-muted, rgba(240, 237, 246, 0.56));
      }

      textarea:focus,
      input:focus,
      select:focus {
        outline: none;
        border-color: var(--studio-border-strong, rgba(232, 121, 249, 0.22));
        box-shadow: 0 0 0 3px rgba(192, 132, 252, 0.08);
      }

      .create-card--controls {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }

      .create-panel__scene-actions {
        display: flex;
        gap: 10px;
        margin-top: 12px;
      }

      .create-panel__scene-actions button,
      .create-panel__submit,
      .sidebar-card__link {
        padding: 11px 16px;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(192, 132, 252, 0.2), rgba(79, 109, 245, 0.16));
        color: var(--studio-text, #f0edf6);
        text-decoration: none;
        transition:
          transform 200ms ease,
          background 200ms ease,
          box-shadow 200ms ease;
      }

      .create-panel__scene-actions button:hover,
      .create-panel__submit:hover,
      .sidebar-card__link:hover {
        transform: translateY(-2px);
        background: linear-gradient(135deg, rgba(192, 132, 252, 0.26), rgba(79, 109, 245, 0.2));
        box-shadow: 0 16px 32px rgba(192, 132, 252, 0.16);
      }

      .scene-list,
      .asset-list {
        display: grid;
        gap: 12px;
      }

      .scene-card {
        display: grid;
        gap: 10px;
        padding: 16px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
      }

      .scene-card__head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .scene-card__head button {
        background: none;
        color: var(--studio-accent, #c084fc);
      }

      .scene-card__grid {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 10px;
      }

      .asset-list__item {
        display: grid;
        gap: 4px;
        padding: 14px;
        text-align: left;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid transparent;
        transition:
          transform 200ms ease,
          border-color 200ms ease,
          background 200ms ease;
      }

      .asset-list__item:hover {
        transform: translateY(-2px);
        border-color: rgba(232, 121, 249, 0.18);
        background: rgba(255, 255, 255, 0.07);
      }

      .asset-list__item--active {
        border-color: var(--studio-border-strong, rgba(232, 121, 249, 0.22));
        background: rgba(255, 255, 255, 0.08);
      }

      .asset-list__item span,
      .sidebar-card p {
        color: var(--studio-text-soft, rgba(240, 237, 246, 0.72));
        line-height: 1.6;
      }

      .sidebar-card__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .sidebar-card__chips span {
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(192, 132, 252, 0.12);
        color: var(--studio-text, #f0edf6);
      }

      .result-video,
      .upload-preview {
        width: 100%;
        border-radius: 18px;
        background: #09090f;
      }

      .create-panel__error {
        color: #f2b4ac;
      }

      .create-panel__footer {
        display: flex;
        justify-content: flex-end;
      }

      @media (max-width: 960px) {
        .create-panel__layout {
          grid-template-columns: 1fr;
        }

        .create-panel__hero {
          padding: 20px;
          border-radius: 24px;
        }

        .scene-card__grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class VideoCreatePanelComponent implements OnInit {
  private readonly workbenchService = inject(VideoWorkbenchService);
  private readonly videoService = inject(VideoService);

  protected readonly activeMode = signal<WorkbenchCreateMode>('text');
  protected readonly modes: WorkbenchCreateMode[] = ['text', 'image', 'storyboard'];
  protected readonly packages = signal<CreativePackageDto[]>([]);
  protected readonly selectedPackageId = signal('');
  protected readonly scenes = signal<WorkbenchScene[]>([]);
  protected readonly planningScenes = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly lastSingleTask = signal<VideoTask | null>(null);
  protected readonly lastStoryboardProject = signal<VideoProjectDto | null>(null);
  protected readonly referencePreview = signal<string | null>(null);
  protected readonly referenceData = signal<string | null>(null);
  protected readonly aspectRatioOptions = signal<string[]>([
    '21:9',
    '16:9',
    '4:3',
    '1:1',
    '3:4',
    '9:16',
  ]);
  protected readonly resolutionOptions = signal<string[]>(['480p', '720p', '1080p']);

  protected singlePrompt = '';
  protected storyPrompt = '';
  protected aspectRatio = '16:9';
  protected resolution = '720p';
  protected duration = 5;

  protected readonly selectedPackage = computed(() =>
    this.packages().find((item) => item.id === this.selectedPackageId()) ?? null,
  );

  protected readonly canSubmit = computed(() => {
    if (this.submitting()) {
      return false;
    }
    if (this.activeMode() === 'storyboard') {
      return Boolean(this.selectedPackageId()) && this.scenes().some((scene) => scene.prompt.trim());
    }
    if (this.activeMode() === 'image') {
      return this.singlePrompt.trim().length > 0 && Boolean(this.referenceData());
    }
    return this.singlePrompt.trim().length > 0;
  });

  ngOnInit(): void {
    this.workbenchService.loadAssets().subscribe({
      next: (packages) => {
        this.packages.set(packages);
        this.selectedPackageId.set(packages[0]?.id ?? '');
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : '加载资料包失败');
      },
    });
    this.videoService.getConfig().subscribe({
      next: (cfg) => {
        this.aspectRatioOptions.set(cfg.aspectRatios);
        this.resolutionOptions.set(cfg.resolutions);
        this.aspectRatio = cfg.aspectRatios[0] ?? this.aspectRatio;
        this.resolution = cfg.resolutions[1] ?? cfg.resolutions[0] ?? this.resolution;
      },
    });
  }

  protected setMode(mode: WorkbenchCreateMode): void {
    this.activeMode.set(mode);
    this.error.set('');
    if (mode === 'storyboard' && this.scenes().length === 0) {
      this.addScene();
    }
  }

  protected modeLabel(mode: WorkbenchCreateMode): string {
    switch (mode) {
      case 'text':
        return '文本创作';
      case 'image':
        return '图片驱动';
      case 'storyboard':
        return '分镜创作';
      default:
        return mode;
    }
  }

  protected autoSplitScenes(): void {
    const packageId = this.selectedPackageId();
    if (!packageId || !this.storyPrompt.trim()) {
      return;
    }
    this.planningScenes.set(true);
    this.error.set('');
    this.workbenchService.planScenes(packageId, this.storyPrompt.trim()).subscribe({
      next: (scenes) => {
        this.scenes.set(scenes);
        this.planningScenes.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : '自动拆分失败');
        this.planningScenes.set(false);
      },
    });
  }

  protected addScene(): void {
    this.scenes.update((scenes) => [
      ...scenes,
      {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `scene-${Date.now()}-${scenes.length}`,
        prompt: '',
        duration: this.duration,
      },
    ]);
  }

  protected removeScene(sceneId: string): void {
    this.scenes.update((scenes) => scenes.filter((scene) => scene.id !== sceneId));
  }

  protected updateScene(
    sceneId: string,
    key: keyof WorkbenchScene,
    value: string | number,
  ): void {
    this.scenes.update((scenes) =>
      scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, [key]: value } : scene,
      ),
    );
  }

  protected handleReferenceUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      this.referencePreview.set(result);
      this.referenceData.set(result);
    };
    reader.onerror = () => {
      this.error.set('图片读取失败');
    };
    reader.readAsDataURL(file);
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    this.lastSingleTask.set(null);
    this.lastStoryboardProject.set(null);

    if (this.activeMode() === 'storyboard') {
      this.workbenchService
        .createStoryboard(this.selectedPackageId(), this.storyPrompt, this.scenes())
        .subscribe({
          next: (project) => {
            this.lastStoryboardProject.set(project);
            this.submitting.set(false);
          },
          error: (error: unknown) => {
            this.error.set(error instanceof Error ? error.message : '创建 storyboard 失败');
            this.submitting.set(false);
          },
        });
      return;
    }

    this.workbenchService
      .createSingle(
        {
          prompt: this.singlePrompt,
          mode: this.activeMode() === 'image' ? 'image' : 'text',
          aspectRatio: this.aspectRatio,
          resolution: this.resolution,
          duration: Math.max(1, Math.round(this.duration)),
          durationUnit: 'seconds',
          firstFrameImage: this.referenceData() ?? undefined,
        },
        this.selectedPackage() ?? undefined,
      )
      .subscribe({
        next: (task) => {
          this.lastSingleTask.set(task);
          this.submitting.set(false);
        },
        error: (error: unknown) => {
          this.error.set(error instanceof Error ? error.message : '提交单视频任务失败');
          this.submitting.set(false);
        },
      });
  }
}
