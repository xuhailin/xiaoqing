import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CharacterAsset, CreativePackageInput } from '../../../core/models/video-agent.models';
import { VideoAgentService } from '../../../core/services/video-agent.service';
import { AppIconComponent } from '../../../shared/ui/app-icon.component';

interface CharacterFormRow {
  name: string;
  appearancePrompt: string;
  referenceImageUrl: string;
}

@Component({
  selector: 'app-package-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent],
  template: `
    <section class="editor-page">
      <div class="editor-page__shell">
        <header class="editor-hero">
          <div class="editor-hero__copy">
            <div class="editor-hero__eyebrow">
              <span class="editor-hero__badge">
                <app-icon name="layers" size="1rem" />
              </span>
              <span>素材包编辑</span>
            </div>
            <h1>{{ packageId() ? '编辑场景资料包' : '新增场景资料包' }}</h1>
            <p>延续素材包主页的浅色系统，把场景关键词、镜头风格和角色描述整理成一份可复用的创作模板。</p>
          </div>

          <a routerLink="/video/assets" class="editor-hero__back">
            <app-icon name="arrowLeft" size="0.9rem" />
            <span>返回素材包</span>
          </a>
        </header>

        @if (loading()) {
          <div class="editor-state">
            <span class="editor-state__title">正在加载资料包…</span>
            <span class="editor-state__desc">稍等一下，现有配置会整理到这张编辑表单里。</span>
          </div>
        } @else {
          <form class="editor-form" (ngSubmit)="save()">
            <section class="editor-section">
              <div class="editor-section__head">
                <div>
                  <h2>基础信息</h2>
                  <p>先定义这个场景包的名称、说明和可选封面，方便在素材包列表里快速识别。</p>
                </div>
              </div>

              <div class="editor-grid editor-grid--two">
                <label class="field">
                  <span class="field__label">名称</span>
                  <input [(ngModel)]="name" name="name" required placeholder="例如：古风庭院夜景" />
                </label>

                <label class="field">
                  <span class="field__label">封面图片 URL</span>
                  <input [(ngModel)]="coverImage" name="coverImage" placeholder="可选，用于后续卡片封面扩展" />
                </label>
              </div>

              <label class="field">
                <span class="field__label">描述</span>
                <textarea
                  [(ngModel)]="description"
                  name="description"
                  rows="3"
                  placeholder="一句话说明这个场景包适合什么样的世界观、镜头语言或创作气质"
                ></textarea>
              </label>
            </section>

            <section class="editor-section">
              <div class="editor-section__head">
                <div>
                  <h2>角色</h2>
                  <p>这里先保留角色描述能力，后续素材包主页的角色 group 可以直接接这份数据。</p>
                </div>
                <button type="button" class="pill-action" (click)="addCharacter()">
                  <app-icon name="plus" size="0.9rem" />
                  <span>新增角色</span>
                </button>
              </div>

              <div class="character-list">
                @for (character of characters(); track $index) {
                  <article class="character-card">
                    <div class="character-card__head">
                      <span class="character-card__index">角色 {{ $index + 1 }}</span>
                      <button type="button" class="icon-action icon-action--danger" (click)="removeCharacter($index)">
                        <app-icon name="close" size="0.9rem" />
                      </button>
                    </div>

                    <div class="editor-grid editor-grid--two">
                      <label class="field">
                        <span class="field__label">角色名</span>
                        <input [(ngModel)]="character.name" [name]="'character-name-' + $index" placeholder="例如：青衣少女" />
                      </label>

                      <label class="field">
                        <span class="field__label">参考图 URL</span>
                        <input
                          [(ngModel)]="character.referenceImageUrl"
                          [name]="'character-image-' + $index"
                          placeholder="可选"
                        />
                      </label>
                    </div>

                    <label class="field">
                      <span class="field__label">外观提示词</span>
                      <textarea
                        [(ngModel)]="character.appearancePrompt"
                        [name]="'character-prompt-' + $index"
                        rows="3"
                        placeholder="描述这个角色的服饰、气质、年龄感或镜头中的辨识特征"
                      ></textarea>
                    </label>
                  </article>
                }
              </div>
            </section>

            <section class="editor-section">
              <div class="editor-section__head">
                <div>
                  <h2>世界观与默认风格</h2>
                  <p>这些内容会作为创作默认值，帮后续生成保持统一的视觉语言。</p>
                </div>
              </div>

              <div class="editor-grid">
                <label class="field">
                  <span class="field__label">色调</span>
                  <input [(ngModel)]="colorTone" name="colorTone" placeholder="例如：柔雾青灰、暖金暮色" />
                </label>
                <label class="field">
                  <span class="field__label">时代</span>
                  <input [(ngModel)]="era" name="era" placeholder="例如：近未来、民国、古风架空" />
                </label>
                <label class="field">
                  <span class="field__label">氛围</span>
                  <input [(ngModel)]="atmosphere" name="atmosphere" placeholder="例如：静谧、悬疑、浪漫" />
                </label>
                <label class="field field--wide">
                  <span class="field__label">场景关键词</span>
                  <input [(ngModel)]="sceneKeywordsText" name="sceneKeywordsText" placeholder="用英文逗号分隔，例如：庭院, 月光, 水面倒影" />
                </label>
                <label class="field">
                  <span class="field__label">默认镜头风格</span>
                  <input [(ngModel)]="shotStyle" name="shotStyle" placeholder="例如：cinematic" />
                </label>
                <label class="field">
                  <span class="field__label">默认比例</span>
                  <input [(ngModel)]="aspectRatio" name="aspectRatio" placeholder="例如：16:9" />
                </label>
                <label class="field">
                  <span class="field__label">默认清晰度</span>
                  <input [(ngModel)]="resolution" name="resolution" placeholder="例如：720p" />
                </label>
                <label class="field">
                  <span class="field__label">默认时长（秒）</span>
                  <input [(ngModel)]="duration" name="duration" type="number" min="1" />
                </label>
              </div>
            </section>

            @if (message()) {
              <div class="editor-notice" [class.editor-notice--error]="isError()">
                <app-icon [name]="isError() ? 'alert' : 'info'" size="0.95rem" />
                <span>{{ message() }}</span>
              </div>
            }

            <div class="editor-actions">
              <a routerLink="/video/assets" class="editor-actions__secondary">取消</a>
              <button type="submit" class="editor-actions__primary" [disabled]="saving() || !name.trim()">
                {{ saving() ? '保存中…' : '保存资料包' }}
              </button>
            </div>
          </form>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100%;
        padding: var(--workbench-shell-padding);
        background: var(--workbench-shell-background);
        overflow-y: auto;
      }

      .editor-page {
        max-width: 980px;
        margin: 0 auto;
        padding-block: var(--space-4);
      }

      .editor-page__shell {
        display: grid;
        gap: 20px;
      }

      .editor-hero,
      .editor-form,
      .editor-state,
      .editor-notice {
        border-radius: 28px;
        border: 1px solid rgba(220, 226, 241, 0.88);
        background:
          radial-gradient(circle at 0% 0%, rgba(255, 232, 240, 0.6), transparent 24%),
          radial-gradient(circle at 100% 0%, rgba(232, 239, 255, 0.72), transparent 26%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 255, 0.94));
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.72),
          0 20px 48px rgba(159, 171, 194, 0.14);
      }

      .editor-hero {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
        padding: clamp(22px, 3vw, 30px);
      }

      .editor-hero__copy {
        min-width: 0;
      }

      .editor-hero__eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
        color: #a37bfb;
        font-size: 0.9rem;
        font-weight: 600;
      }

      .editor-hero__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 18px;
        border: 1px solid rgba(199, 182, 255, 0.46);
        background: linear-gradient(180deg, rgba(241, 237, 255, 0.98), rgba(233, 244, 255, 0.92));
        color: #7b6bff;
      }

      .editor-hero h1 {
        margin: 0 0 12px;
        color: #161d2d;
        font-size: clamp(2rem, 4vw, 3rem);
        line-height: 1.04;
        letter-spacing: -0.04em;
      }

      .editor-hero p {
        margin: 0;
        max-width: 58ch;
        color: #6b7892;
        line-height: 1.75;
      }

      .editor-hero__back {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 2.5rem;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(207, 215, 235, 0.96);
        background: rgba(255, 255, 255, 0.84);
        color: #5b6881;
        text-decoration: none;
        white-space: nowrap;
      }

      .editor-form {
        display: grid;
        gap: 18px;
        padding: clamp(18px, 2.6vw, 28px);
      }

      .editor-section {
        display: grid;
        gap: 16px;
        padding: 18px;
        border-radius: 24px;
        border: 1px solid rgba(224, 230, 244, 0.96);
        background: rgba(255, 255, 255, 0.72);
      }

      .editor-section__head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
      }

      .editor-section__head h2 {
        margin: 0 0 6px;
        color: #1d2538;
        font-size: 1.05rem;
      }

      .editor-section__head p {
        margin: 0;
        color: #75829a;
        line-height: 1.65;
      }

      .editor-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }

      .editor-grid--two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field--wide {
        grid-column: 1 / -1;
      }

      .field__label {
        color: #334055;
        font-size: 0.92rem;
        font-weight: 600;
      }

      input,
      textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(211, 219, 237, 0.98);
        background: rgba(252, 253, 255, 0.92);
        color: #192133;
        font: inherit;
        transition:
          border-color 160ms ease,
          box-shadow 160ms ease,
          background 160ms ease;
      }

      input::placeholder,
      textarea::placeholder {
        color: #97a3ba;
      }

      input:focus,
      textarea:focus {
        outline: none;
        border-color: rgba(179, 161, 255, 0.98);
        background: rgba(255, 255, 255, 1);
        box-shadow: 0 0 0 4px rgba(192, 132, 252, 0.1);
      }

      .character-list {
        display: grid;
        gap: 12px;
      }

      .character-card {
        display: grid;
        gap: 14px;
        padding: 16px;
        border-radius: 22px;
        border: 1px solid rgba(223, 229, 243, 0.96);
        background: rgba(250, 251, 255, 0.88);
      }

      .character-card__head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .character-card__index {
        color: #7b88a3;
        font-size: 0.88rem;
        font-weight: 600;
      }

      .pill-action,
      .editor-actions__primary,
      .editor-actions__secondary,
      .icon-action {
        font: inherit;
      }

      .pill-action {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 2.4rem;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(197, 210, 255, 0.92);
        background: linear-gradient(180deg, rgba(241, 245, 255, 0.98), rgba(248, 240, 255, 0.96));
        color: #5f73fb;
        cursor: pointer;
      }

      .icon-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 999px;
        border: 1px solid rgba(216, 222, 239, 0.96);
        background: rgba(255, 255, 255, 0.92);
        color: #687695;
        cursor: pointer;
      }

      .icon-action--danger {
        color: #be6d75;
      }

      .editor-state,
      .editor-notice {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 16px 18px;
      }

      .editor-state {
        display: grid;
        gap: 6px;
      }

      .editor-state__title {
        color: #1f283d;
        font-weight: 600;
      }

      .editor-state__desc {
        color: #77839b;
        line-height: 1.7;
      }

      .editor-notice {
        color: #5f6b83;
      }

      .editor-notice--error {
        color: #b55459;
      }

      .editor-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }

      .editor-actions__secondary,
      .editor-actions__primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.7rem;
        padding: 0 18px;
        border-radius: 999px;
        text-decoration: none;
        cursor: pointer;
      }

      .editor-actions__secondary {
        border: 1px solid rgba(210, 218, 237, 0.96);
        background: rgba(255, 255, 255, 0.84);
        color: #66738d;
      }

      .editor-actions__primary {
        border: 1px solid rgba(192, 206, 255, 0.92);
        background: linear-gradient(180deg, rgba(238, 245, 255, 0.98), rgba(246, 238, 255, 0.96));
        color: #5c71fb;
      }

      .editor-actions__primary:disabled {
        opacity: 0.6;
        cursor: default;
      }

      @media (max-width: 760px) {
        .editor-hero,
        .editor-section__head,
        .editor-actions {
          grid-template-columns: 1fr;
          display: grid;
        }

        .editor-grid--two {
          grid-template-columns: 1fr;
        }

        .editor-hero__back,
        .pill-action,
        .editor-actions__secondary,
        .editor-actions__primary {
          width: 100%;
        }
      }
    `,
  ],
})
export class PackageEditorComponent implements OnInit {
  private readonly videoAgentService = inject(VideoAgentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly packageId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  protected readonly characters = signal<CharacterFormRow[]>([]);

  protected name = '';
  protected description = '';
  protected coverImage = '';
  protected colorTone = '';
  protected era = '';
  protected atmosphere = '';
  protected sceneKeywordsText = '';
  protected shotStyle = 'static';
  protected aspectRatio = '16:9';
  protected resolution = '720p';
  protected duration = 5;

  ngOnInit(): void {
    const packageId = this.route.snapshot.paramMap.get('id');
    this.packageId.set(packageId);
    if (!packageId) {
      this.characters.set([{ name: '', appearancePrompt: '', referenceImageUrl: '' }]);
      return;
    }

    this.loading.set(true);
    this.videoAgentService.getPackage(packageId).subscribe({
      next: (pkg) => {
        this.name = pkg.name;
        this.description = pkg.description || '';
        this.coverImage = pkg.coverImage || '';
        this.colorTone = pkg.worldStyle.colorTone;
        this.era = pkg.worldStyle.era;
        this.atmosphere = pkg.worldStyle.atmosphere;
        this.sceneKeywordsText = pkg.worldStyle.sceneKeywords.join(', ');
        this.shotStyle = pkg.stylePreset.shotStyle;
        this.aspectRatio = pkg.stylePreset.aspectRatio;
        this.resolution = pkg.stylePreset.resolution;
        this.duration = pkg.stylePreset.duration;
        this.characters.set(
          pkg.characters.length
            ? pkg.characters.map((character) => ({
                name: character.name,
                appearancePrompt: character.appearancePrompt,
                referenceImageUrl: character.referenceImageUrl || '',
              }))
            : [{ name: '', appearancePrompt: '', referenceImageUrl: '' }],
        );
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.message.set(error instanceof Error ? error.message : '加载资料包失败');
        this.isError.set(true);
        this.loading.set(false);
      },
    });
  }

  protected addCharacter(): void {
    this.characters.update((items) => [
      ...items,
      { name: '', appearancePrompt: '', referenceImageUrl: '' },
    ]);
  }

  protected removeCharacter(index: number): void {
    this.characters.update((items) => items.filter((_, itemIndex) => itemIndex !== index));
    if (this.characters().length === 0) {
      this.addCharacter();
    }
  }

  protected save(): void {
    const payload = this.buildPayload();
    this.saving.set(true);
    this.message.set('');
    this.isError.set(false);

    const request = this.packageId()
      ? this.videoAgentService.updatePackage(this.packageId()!, payload)
      : this.videoAgentService.createPackage(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/video/assets']);
      },
      error: (error: unknown) => {
        this.message.set(error instanceof Error ? error.message : '保存失败');
        this.isError.set(true);
        this.saving.set(false);
      },
    });
  }

  private buildPayload(): CreativePackageInput {
    const characters: CharacterAsset[] = this.characters()
      .map((character) => ({
        name: character.name.trim(),
        appearancePrompt: character.appearancePrompt.trim(),
        referenceImageUrl: character.referenceImageUrl.trim() || undefined,
      }))
      .filter((character) => character.name || character.appearancePrompt);

    return {
      name: this.name.trim(),
      description: this.description.trim() || undefined,
      coverImage: this.coverImage.trim() || undefined,
      source: 'user',
      characters,
      worldStyle: {
        colorTone: this.colorTone.trim(),
        era: this.era.trim(),
        atmosphere: this.atmosphere.trim(),
        sceneKeywords: this.sceneKeywordsText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      },
      stylePreset: {
        shotStyle: this.shotStyle.trim() || 'static',
        aspectRatio: this.aspectRatio.trim() || '16:9',
        resolution: this.resolution.trim() || '720p',
        duration: Number(this.duration) > 0 ? Number(this.duration) : 5,
      },
    };
  }
}
