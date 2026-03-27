import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  SeedanceService,
  type SeedanceConfig,
  type SeedanceHistoryItem,
  type VideoStatus,
} from '../../core/services/seeddance.service';
import { AppButtonComponent } from '../../shared/ui/app-button.component';

type VideoMode = 'text' | 'image' | 'keyframe';

const PLACEHOLDERS: Record<VideoMode, string> = {
  text: '描述你想要的画面，越详细效果越好...例如：城市夜景延时，霓虹灯倒影在湿润路面，镜头缓缓推进',
  image: '描述图片中应该发生的动作（可留空，AI 自动分析画面）',
  keyframe: '描述从首帧到尾帧的过渡方式（可留空）',
};

const MODE_NAMES: Record<VideoMode, string> = {
  text: '文生视频',
  image: '图生视频',
  keyframe: '首尾帧',
};

@Component({
  selector: 'app-seeddance-quick',
  standalone: true,
  imports: [FormsModule, RouterLink, AppButtonComponent],
  template: `
    <div class="create-page">

      <!-- Header / Breadcrumb -->
      <header class="create-header">
        <nav class="breadcrumb">
          <a class="breadcrumb__link" routerLink="/quick/video">创作</a>
          <span class="breadcrumb__sep">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 3l3 3-3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="breadcrumb__current">{{ modeName() }}</span>
        </nav>
      </header>

      <!-- Main layout -->
      <div class="create-layout">

        <!-- LEFT PANEL -->
        <aside class="left-panel">

          <!-- Tab selector -->
          <div class="tab-group">
            @for (mode of modes; track mode) {
              <button
                type="button"
                class="tab-btn"
                [class.tab-btn--active]="activeTab() === mode"
                (click)="setMode(mode)"
              >{{ modeLabel(mode) }}</button>
            }
          </div>

          <div class="left-scroll">

            <!-- Prompt -->
            <div class="field">
              <div class="field__head">
                <span class="field-label">描述</span>
                <span class="char-count">{{ prompt().length }}/2000</span>
              </div>
              <textarea
                class="prompt-area"
                rows="5"
                maxlength="2000"
                [placeholder]="promptPlaceholder()"
                [ngModel]="prompt()"
                (ngModelChange)="prompt.set($event)"
                [disabled]="submitting()"
              ></textarea>
            </div>

            <!-- Image upload: image mode -->
            @if (activeTab() === 'image') {
              <div class="field">
                <span class="field-label">参考图片</span>
                <div
                  class="upload-zone"
                  [class.upload-zone--has-image]="firstFramePreview()"
                  (click)="triggerUpload('single')"
                  (dragover)="$event.preventDefault()"
                  (drop)="handleDrop($event, 'first')"
                >
                  @if (firstFramePreview()) {
                    <img class="upload-zone__preview" [src]="firstFramePreview()!" alt="参考图预览" />
                    <button type="button" class="upload-zone__clear" (click)="clearFrame('first', $event)">×</button>
                  } @else {
                    <div class="upload-zone__placeholder">
                      <svg class="upload-icon" width="28" height="28" viewBox="0 0 28 28" fill="none">
                        <path d="M14 18V10M10 14l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <rect x="4" y="4" width="20" height="20" rx="4" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.5"/>
                      </svg>
                      <span>点击或拖拽上传图片</span>
                      <span class="upload-hint">JPG / PNG，不超过 10MB</span>
                    </div>
                  }
                </div>
                <input #singleUpload type="file" accept="image/*" class="file-input-hidden"
                  (change)="handleFirstFrame($event)" />
              </div>
            }

            <!-- Image upload: keyframe mode -->
            @if (activeTab() === 'keyframe') {
              <div class="field">
                <span class="field-label">首尾帧</span>
                <div class="keyframe-grid">
                  <div class="keyframe-slot">
                    <div
                      class="upload-zone upload-zone--small"
                      [class.upload-zone--has-image]="firstFramePreview()"
                      (click)="triggerUpload('first')"
                    >
                      @if (firstFramePreview()) {
                        <img class="upload-zone__preview" [src]="firstFramePreview()!" alt="首帧" />
                        <button type="button" class="upload-zone__clear" (click)="clearFrame('first', $event)">×</button>
                      } @else {
                        <div class="upload-zone__placeholder upload-zone__placeholder--small">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 13V7M7 10l3-3 3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                            <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1" stroke-dasharray="2.5 2" opacity="0.4"/>
                          </svg>
                          <span>首帧</span>
                          <span class="frame-label">START</span>
                        </div>
                      }
                    </div>
                    <input #firstUpload type="file" accept="image/*" class="file-input-hidden"
                      (change)="handleFirstFrame($event)" />
                  </div>
                  <div class="keyframe-slot">
                    <div
                      class="upload-zone upload-zone--small"
                      [class.upload-zone--has-image]="lastFramePreview()"
                      (click)="triggerUpload('last')"
                    >
                      @if (lastFramePreview()) {
                        <img class="upload-zone__preview" [src]="lastFramePreview()!" alt="尾帧" />
                        <button type="button" class="upload-zone__clear" (click)="clearFrame('last', $event)">×</button>
                      } @else {
                        <div class="upload-zone__placeholder upload-zone__placeholder--small">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 13V7M7 10l3-3 3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                            <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1" stroke-dasharray="2.5 2" opacity="0.4"/>
                          </svg>
                          <span>尾帧</span>
                          <span class="frame-label">END</span>
                        </div>
                      }
                    </div>
                    <input #lastUpload type="file" accept="image/*" class="file-input-hidden"
                      (change)="handleLastFrame($event)" />
                  </div>
                </div>
              </div>
            }

            <div class="divider"></div>

            <!-- Aspect ratio -->
            <div class="field">
              <span class="field-label">视频比例</span>
              <div class="ratio-group">
                @for (r of aspectRatioOptions(); track r) {
                  <button type="button" class="ratio-btn"
                    [class.ratio-btn--active]="aspectRatio() === r"
                    [disabled]="submitting()"
                    (click)="aspectRatio.set(r)">
                    <span class="ratio-preview" [style]="ratioStyle(r)"></span>
                    <span>{{ r }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Resolution -->
            <div class="field">
              <span class="field-label">分辨率</span>
              <div class="chip-group">
                @for (opt of resolutionOptions(); track opt) {
                  <label class="chip-option">
                    <input type="radio" name="resolution" [value]="opt"
                      [checked]="resolution() === opt"
                      [disabled]="submitting()"
                      (change)="resolution.set(opt)" />
                    <span>{{ opt }}</span>
                  </label>
                }
              </div>
            </div>

            <!-- Duration -->
            <div class="field">
              <span class="field-label">视频时长</span>
              <div class="duration-row">
                <input class="duration-input" type="number" min="1"
                  [max]="durationUnit() === 'seconds' ? 300 : 9000"
                  [ngModel]="duration()"
                  (ngModelChange)="setDuration($event)"
                  [disabled]="submitting()" />
                <div class="chip-group">
                  <label class="chip-option">
                    <input type="radio" name="unit" value="seconds"
                      [checked]="durationUnit() === 'seconds'"
                      [disabled]="submitting()"
                      (change)="toggleUnit('seconds')" />
                    <span>秒</span>
                  </label>
                  <label class="chip-option">
                    <input type="radio" name="unit" value="frames"
                      [checked]="durationUnit() === 'frames'"
                      [disabled]="submitting()"
                      (change)="toggleUnit('frames')" />
                    <span>帧</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- Count -->
            <div class="field">
              <span class="field-label">生成数量</span>
              <div class="count-control">
                <button type="button" class="count-btn" [disabled]="count() <= 1 || submitting()"
                  (click)="count.set(count() - 1)">－</button>
                <span class="count-value">{{ count() }}</span>
                <button type="button" class="count-btn" [disabled]="count() >= 4 || submitting()"
                  (click)="count.set(count() + 1)">＋</button>
              </div>
            </div>

          </div><!-- /left-scroll -->

          <!-- Generate button -->
          <div class="generate-area">
            @if (streamError()) {
              <div class="error-bar">{{ streamError() }}</div>
            }
            @if (submitting()) {
              <app-button variant="ghost" size="md" (click)="cancel()">取消</app-button>
            }
            <app-button variant="primary" size="md" [disabled]="!canSubmit()" (click)="submit()">
              @if (submitting()) {
                <span class="spinner"></span>生成中...
              } @else {
                生成视频
              }
            </app-button>
          </div>

        </aside>

        <!-- RIGHT PANEL -->
        <main class="right-panel">

          <!-- Empty state -->
          @if (!taskId() && !videoStatus()) {
            <div class="result-empty">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="1.2" opacity="0.1"/>
                <rect x="18" y="20" width="28" height="24" rx="4" stroke="currentColor" stroke-width="1.4" opacity="0.2"/>
                <path d="M27 32l3 3 7-7" stroke="url(#emptyPlayGrad)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <defs>
                  <linearGradient id="emptyPlayGrad" x1="27" y1="28" x2="37" y2="35" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#c084fc"/>
                    <stop offset="1" stop-color="#818cf8"/>
                  </linearGradient>
                </defs>
              </svg>
              <p class="result-empty__text">在左侧配置参数，开始生成</p>
              <p class="result-empty__sub">首次生成通常需要 30–90 秒</p>
            </div>
          }

          <!-- Task progress -->
          @if (videoStatus()?.status === 'pending' || videoStatus()?.status === 'running') {
            <div class="result-progress">
              <div class="progress-header">
                <span class="progress-label">
                  <span class="pulse-dot"></span>
                  {{ statusText(videoStatus()) }}
                </span>
                @if (taskId()) {
                  <code class="task-id">{{ shortTaskId() }}</code>
                }
              </div>
              <div class="progress-bar-wrap">
                <div class="progress-bar-track">
                  <div class="progress-bar-fill progress-bar-fill--indeterminate"></div>
                </div>
              </div>
              <p class="progress-hint">AI 正在生成中，请稍候……</p>
            </div>
          }

          <!-- Completed: video grid -->
          @if (videoStatus()?.status === 'completed' && videoStatus()?.videoUrl) {
            <div class="result-grid result-grid--1">
              <div class="video-card">
                <video class="video-card__player" controls loop [src]="videoStatus()!.videoUrl!"></video>
                <div class="video-card__footer">
                  <span class="video-card__meta">{{ resolution() }} · {{ duration() }}{{ durationUnit() === 'seconds' ? 's' : 'f' }}</span>
                  <a class="video-card__download" [href]="videoStatus()!.videoUrl!" download target="_blank" rel="noreferrer">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 2v7M4 7l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    下载
                  </a>
                </div>
              </div>
            </div>
          }

          <!-- Failed -->
          @if (videoStatus()?.status === 'failed') {
            <div class="result-error">
              <div class="result-error__icon">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="13" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
                  <path d="M16 10v7M16 20v1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
              <strong>生成失败</strong>
              <p>{{ videoStatus()?.error || '任务执行失败，请重试' }}</p>
              <app-button variant="ghost" size="sm" (click)="retryStatusTracking()">重试</app-button>
            </div>
          }

          <!-- Task history strip (only shown when there's a current task) -->
          @if (taskId()) {
            <div class="task-strip">
              <span class="task-strip__label">任务 ID</span>
              <code class="task-strip__id">{{ taskId() }}</code>
              <button type="button" class="task-strip__refresh" [disabled]="submitting()" (click)="refreshStatus()">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 6.5A4.5 4.5 0 0 1 9.5 3M11 6.5A4.5 4.5 0 0 1 3.5 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  <path d="M9 1.5l.5 1.5-1.5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M4 11.5l-.5-1.5 1.5-.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                刷新
              </button>
            </div>
          }

        </main>

      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      padding: var(--workbench-shell-padding);
      background: var(--workbench-shell-background);
      overflow-y: auto;
    }

    .create-page {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: var(--space-4);
      min-height: min-content;
    }

    /* ── Header ── */
    .create-header {
      flex-shrink: 0;
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .breadcrumb__link {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      text-decoration: none;
      transition: color 160ms ease;
    }

    .breadcrumb__link:hover {
      color: var(--color-primary);
    }

    .breadcrumb__sep {
      color: var(--color-text-muted);
      display: flex;
      align-items: center;
    }

    .breadcrumb__current {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    /* ── Layout ── */
    .create-layout {
      display: flex;
      flex: 1;
      gap: var(--space-4);
      align-items: stretch;
      min-height: 0;
    }

    /* ── Left Panel ── */
    .left-panel {
      width: 360px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      border-radius: var(--workbench-panel-radius);
      border: 1px solid var(--color-border-light);
      background: var(--color-panel-subtle-bg);
      backdrop-filter: blur(16px);
      padding: var(--space-4);
      overflow: hidden;
      min-height: 0;
    }

    .left-scroll {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-height: 0;
      scrollbar-width: thin;
      scrollbar-color: var(--color-border) transparent;
      padding-right: 2px;
    }

    /* ── Tab ── */
    .tab-group {
      display: flex;
      gap: var(--space-1);
      padding: 3px;
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--color-border-light) 60%, transparent);
      flex-shrink: 0;
    }

    .tab-btn {
      flex: 1;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      border: none;
      background: transparent;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      transition: background 180ms ease, color 180ms ease, box-shadow 180ms ease;
      white-space: nowrap;
    }

    .tab-btn--active {
      background: var(--color-surface);
      color: var(--color-text);
      box-shadow: 0 2px 8px rgba(0,0,0,0.08), inset 0 0 0 1px color-mix(in srgb, #c084fc 22%, transparent);
    }

    /* ── Fields ── */
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .field__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .field-label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .char-count {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .prompt-area {
      width: 100%;
      min-height: 120px;
      max-height: 240px;
      resize: vertical;
      padding: var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: color-mix(in srgb, var(--color-surface) 80%, transparent);
      color: var(--color-text);
      font-size: var(--font-size-sm);
      font-family: var(--font-family);
      line-height: 1.6;
      transition: border-color 160ms ease;
      box-sizing: border-box;
    }

    .prompt-area:focus {
      outline: none;
      border-color: color-mix(in srgb, #c084fc 50%, var(--color-border));
      box-shadow: 0 0 0 3px color-mix(in srgb, #c084fc 10%, transparent);
    }

    /* ── Upload zone ── */
    .upload-zone {
      position: relative;
      border-radius: var(--radius-lg);
      border: 1.5px dashed var(--color-border);
      background: color-mix(in srgb, var(--color-surface) 60%, transparent);
      cursor: pointer;
      overflow: hidden;
      transition: border-color 160ms ease, background 160ms ease;
      aspect-ratio: 16/9;
    }

    .upload-zone:hover {
      border-color: color-mix(in srgb, #c084fc 40%, var(--color-border));
      background: color-mix(in srgb, #c084fc 4%, var(--color-surface));
    }

    .upload-zone--has-image {
      border-style: solid;
      border-color: var(--color-border-light);
    }

    .upload-zone--small {
      aspect-ratio: 1 / 1;
    }

    .upload-zone__preview {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .upload-zone__clear {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: none;
      background: rgba(0,0,0,0.55);
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .upload-zone__placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      padding: var(--space-3);
    }

    .upload-zone__placeholder--small {
      font-size: var(--font-size-xs);
      gap: var(--space-1);
    }

    .upload-hint {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      opacity: 0.7;
    }

    .upload-icon {
      color: var(--color-text-muted);
      opacity: 0.6;
    }

    .frame-label {
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: color-mix(in srgb, #c084fc 70%, var(--color-text-muted));
      font-weight: var(--font-weight-semibold);
    }

    .keyframe-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }

    .file-input-hidden {
      display: none;
    }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: var(--color-border-light);
      opacity: 0.6;
    }

    /* ── Ratio buttons ── */
    .ratio-group {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .ratio-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      background: color-mix(in srgb, var(--color-surface) 80%, transparent);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      cursor: pointer;
      transition: all 160ms ease;
    }

    .ratio-btn:hover {
      border-color: color-mix(in srgb, #c084fc 30%, var(--color-border));
      color: var(--color-text);
    }

    .ratio-btn--active {
      border-color: color-mix(in srgb, #c084fc 50%, var(--color-border));
      background: color-mix(in srgb, #c084fc 10%, var(--color-surface));
      color: var(--color-text);
    }

    .ratio-preview {
      border: 1.5px solid currentColor;
      border-radius: 2px;
      display: block;
      opacity: 0.6;
    }

    /* ── Chip options ── */
    .chip-group {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .chip-option {
      position: relative;
      cursor: pointer;
    }

    .chip-option input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .chip-option span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 5px 14px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--color-border);
      background: color-mix(in srgb, var(--color-surface) 80%, transparent);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      transition: all 160ms ease;
    }

    .chip-option input:checked + span {
      border-color: color-mix(in srgb, #c084fc 50%, var(--color-border));
      background: color-mix(in srgb, #c084fc 12%, var(--color-surface));
      color: var(--color-text);
    }

    /* ── Duration ── */
    .duration-row {
      display: flex;
      gap: var(--space-3);
      align-items: center;
    }

    .duration-input {
      width: 80px;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      background: color-mix(in srgb, var(--color-surface) 80%, transparent);
      color: var(--color-text);
      font-size: var(--font-size-sm);
      font-family: var(--font-family);
    }

    .duration-input:focus {
      outline: none;
      border-color: color-mix(in srgb, #c084fc 50%, var(--color-border));
    }

    /* ── Count control ── */
    .count-control {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .count-btn {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      background: color-mix(in srgb, var(--color-surface) 80%, transparent);
      color: var(--color-text-secondary);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 160ms ease;
    }

    .count-btn:hover:not(:disabled) {
      border-color: color-mix(in srgb, #c084fc 40%, var(--color-border));
      color: var(--color-text);
    }

    .count-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .count-value {
      min-width: 24px;
      text-align: center;
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    /* ── Generate area ── */
    .generate-area {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-border-light);
    }

    .generate-area app-button {
      width: 100%;
    }

    .error-bar {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-error-bg);
      border: 1px solid var(--color-error-border);
      color: var(--color-error);
      font-size: var(--font-size-xs);
      line-height: 1.5;
    }

    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.25);
      border-top-color: rgba(255,255,255,0.9);
      animation: spin 700ms linear infinite;
      margin-right: 6px;
      vertical-align: middle;
      flex-shrink: 0;
    }

    /* ── Right Panel ── */
    .right-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      border-radius: var(--workbench-panel-radius);
      border: 1px solid var(--color-border-light);
      background: var(--color-panel-subtle-bg);
      backdrop-filter: blur(16px);
      padding: var(--space-5);
      overflow-y: auto;
      min-height: 0;
    }

    /* Empty state */
    .result-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      text-align: center;
      color: var(--color-text-muted);
      padding: var(--space-6);
    }

    .result-empty__text {
      margin: 0;
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
    }

    .result-empty__sub {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      line-height: 1.6;
    }

    /* Progress */
    .result-progress {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-xl);
      border: 1px solid color-mix(in srgb, #c084fc 20%, var(--color-border-light));
      background: color-mix(in srgb, #c084fc 5%, var(--color-surface));
    }

    .progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .progress-label {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
      font-size: var(--font-size-sm);
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #c084fc;
      animation: pulse 1.4s ease-in-out infinite;
    }

    .task-id {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      background: color-mix(in srgb, var(--color-surface) 80%, transparent);
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--color-border-light);
    }

    .progress-bar-wrap {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .progress-bar-track {
      height: 4px;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, #c084fc 16%, var(--color-border-light));
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      border-radius: var(--radius-pill);
      background: linear-gradient(90deg, #c084fc, #818cf8);
    }

    .progress-bar-fill--indeterminate {
      width: 40%;
      animation: indeterminate 1.6s ease-in-out infinite;
    }

    .progress-hint {
      margin: 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    /* Video grid */
    .result-grid {
      display: grid;
      gap: var(--space-3);
    }

    .result-grid--1 {
      grid-template-columns: 1fr;
    }

    .video-card {
      border-radius: var(--radius-xl);
      border: 1px solid var(--color-border-light);
      overflow: hidden;
      background: var(--color-surface);
    }

    .video-card__player {
      width: 100%;
      display: block;
      max-height: 480px;
      object-fit: contain;
      background: #000;
    }

    .video-card__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2) var(--space-3);
    }

    .video-card__meta {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .video-card__download {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-size-xs);
      color: var(--color-primary);
      text-decoration: none;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
      background: color-mix(in srgb, var(--color-primary) 6%, transparent);
      transition: background 160ms ease;
    }

    .video-card__download:hover {
      background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    }

    /* Error */
    .result-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-5);
      text-align: center;
      border-radius: var(--radius-xl);
      border: 1px solid var(--color-error-border);
      background: var(--color-error-bg);
    }

    .result-error__icon {
      color: var(--color-error);
    }

    .result-error strong {
      color: var(--color-error);
      font-size: var(--font-size-md);
    }

    .result-error p {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      line-height: 1.6;
    }

    /* Task strip */
    .task-strip {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border-light);
      background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    }

    .task-strip__label {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      flex-shrink: 0;
    }

    .task-strip__id {
      flex: 1;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .task-strip__refresh {
      display: flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: transparent;
      color: var(--color-primary);
      font-size: var(--font-size-xs);
      cursor: pointer;
      padding: 0;
    }

    .task-strip__refresh:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* ── Animations ── */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }

    @keyframes indeterminate {
      0% { transform: translateX(-250%); }
      100% { transform: translateX(350%); }
    }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .create-layout {
        flex-direction: column;
      }

      .left-panel {
        width: 100%;
      }
    }

    @media (max-width: 768px) {
      :host {
        padding: var(--workbench-shell-padding-mobile);
      }

      .right-panel {
        padding: var(--space-4);
      }
    }
  `],
})
export class SeedanceQuickComponent implements OnInit, OnDestroy {
  private readonly seedance = inject(SeedanceService);
  private readonly route = inject(ActivatedRoute);
  private streamSubscription: Subscription | null = null;

  // ── Tab / mode ──
  protected readonly activeTab = signal<VideoMode>('text');
  protected readonly modes: VideoMode[] = ['text', 'image', 'keyframe'];

  // ── Params ──
  protected readonly prompt = signal('');
  protected readonly aspectRatio = signal('16:9');
  protected readonly resolution = signal('720p');
  protected readonly duration = signal(5);
  protected readonly durationUnit = signal<'seconds' | 'frames'>('seconds');
  protected readonly count = signal(1);

  // ── Uploads ──
  protected readonly firstFramePreview = signal<string | null>(null);
  protected readonly lastFramePreview = signal<string | null>(null);
  protected readonly firstFrameData = signal<string | null>(null);
  protected readonly lastFrameData = signal<string | null>(null);

  // ── Task state ──
  protected readonly submitting = signal(false);
  protected readonly taskId = signal<string | null>(null);
  protected readonly videoStatus = signal<VideoStatus | null>(null);
  protected readonly streamError = signal<string | null>(null);

  // ── Config options ──
  protected readonly aspectRatioOptions = signal<string[]>([
    '21:9', '16:9', '4:3', '1:1', '3:4', '9:16',
  ]);
  protected readonly resolutionOptions = signal<string[]>(['480p', '720p', '1080p']);

  // ── Computed ──
  protected readonly canSubmit = computed(
    () => this.prompt().trim().length > 0 && !this.submitting(),
  );

  protected readonly promptPlaceholder = computed(
    () => PLACEHOLDERS[this.activeTab()],
  );

  protected readonly modeName = computed(() => MODE_NAMES[this.activeTab()]);

  ngOnInit(): void {
    // Read mode from query param (set by home page card click)
    this.route.queryParams.subscribe((p) => {
      const m = p['mode'] as VideoMode | undefined;
      if (m && this.modes.includes(m)) {
        this.activeTab.set(m);
      }
    });

    this.seedance.getConfig().subscribe({
      next: (cfg) => this.applyConfig(cfg),
      error: () => { /* use local defaults */ },
    });
  }

  ngOnDestroy(): void {
    this.stopStream();
  }

  // ── Mode ──
  protected setMode(mode: VideoMode): void {
    this.activeTab.set(mode);
  }

  protected modeLabel(mode: VideoMode): string {
    return MODE_NAMES[mode];
  }

  // ── Submit ──
  protected submit(): void {
    if (!this.canSubmit()) return;
    this.stopStream();
    this.submitting.set(true);
    this.taskId.set(null);
    this.videoStatus.set(null);
    this.streamError.set(null);

    const prompt = this.prompt().trim();
    const mode = this.activeTab();
    const aspectRatio = this.aspectRatio();
    const resolution = this.resolution();

    this.seedance.createVideo({
      prompt,
      aspectRatio,
      resolution,
      duration: this.duration(),
      durationUnit: this.durationUnit(),
      firstFrameImage: this.firstFrameData() ?? undefined,
      lastFrameImage: mode === 'keyframe' ? (this.lastFrameData() ?? undefined) : undefined,
    }).subscribe({
      next: ({ taskId }) => {
        this.taskId.set(taskId);
        const historyItem: SeedanceHistoryItem = {
          taskId,
          prompt,
          mode,
          status: 'pending',
          aspectRatio,
          resolution,
          createdAt: Date.now(),
        };
        this.seedance.addHistory(historyItem);
        this.startStream(taskId);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.streamError.set(this.describeError(err, '提交失败'));
      },
    });
  }

  protected cancel(): void {
    this.stopStream();
    this.submitting.set(false);
    // TODO: call cancel API
  }

  protected refreshStatus(): void {
    const id = this.taskId();
    if (!id) return;
    this.submitting.set(true);
    this.streamError.set(null);
    this.seedance.getVideoStatus(id).subscribe({
      next: (s) => {
        this.videoStatus.set(s);
        if (s.status === 'completed' || s.status === 'failed') {
          this.submitting.set(false);
          return;
        }
        this.startStream(id);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.streamError.set(this.describeError(err, '刷新失败'));
      },
    });
  }

  protected retryStatusTracking(): void {
    if (this.taskId()) { this.refreshStatus(); return; }
    this.submit();
  }

  // ── Upload ──
  protected triggerUpload(which: 'single' | 'first' | 'last'): void {
    // Use native click via ElementRef alternative: trigger via hidden input
    const selector =
      which === 'last' ? 'input[type=file]:last-of-type' : 'input[type=file]';
    const input = document.querySelector<HTMLInputElement>(
      `.left-panel ${selector}`,
    );
    input?.click();
  }

  protected handleDrop(event: DragEvent, which: 'first' | 'last'): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.readFrame(file, which);
  }

  protected handleFirstFrame(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.readFrame(file, 'first');
    (event.target as HTMLInputElement).value = '';
  }

  protected handleLastFrame(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.readFrame(file, 'last');
    (event.target as HTMLInputElement).value = '';
  }

  protected clearFrame(which: 'first' | 'last', event?: Event): void {
    event?.stopPropagation();
    if (which === 'first') {
      this.firstFramePreview.set(null);
      this.firstFrameData.set(null);
    } else {
      this.lastFramePreview.set(null);
      this.lastFrameData.set(null);
    }
  }

  protected setDuration(v: string | number): void {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) { this.duration.set(1); return; }
    this.duration.set(Math.round(n));
  }

  protected toggleUnit(unit: 'seconds' | 'frames'): void {
    const prev = this.durationUnit();
    if (prev === unit) return;
    const val = this.duration();
    if (unit === 'frames') {
      this.duration.set(val * 24);
    } else {
      this.duration.set(Math.max(1, Math.round(val / 24)));
    }
    this.durationUnit.set(unit);
  }

  protected ratioStyle(ratio: string): Record<string, string> {
    const [w, h] = ratio.split(':').map(Number);
    const base = 14;
    const scale = Math.min(base / w, base / h);
    return {
      width: `${Math.round(w * scale)}px`,
      height: `${Math.round(h * scale)}px`,
    };
  }

  protected statusText(s: VideoStatus | null): string {
    switch (s?.status) {
      case 'pending': return '排队中';
      case 'running': return '生成中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      default: return '等待提交';
    }
  }

  protected shortTaskId(): string {
    const id = this.taskId();
    if (!id) return '';
    return id.length > 12 ? id.slice(0, 8) + '…' : id;
  }

  // ── Private ──
  private startStream(taskId: string): void {
    this.stopStream();
    this.streamSubscription = this.seedance.streamVideoStatus(taskId).subscribe({
      next: (s) => {
        this.videoStatus.set(s);
        this.streamError.set(null);
        if (s.status === 'completed' || s.status === 'failed') {
          this.seedance.updateHistory(taskId, { status: s.status, videoUrl: s.videoUrl });
          this.submitting.set(false);
          this.stopStream();
        }
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.streamError.set(this.describeError(err, '进度推送断开，请手动刷新'));
      },
    });
  }

  private stopStream(): void {
    this.streamSubscription?.unsubscribe();
    this.streamSubscription = null;
  }

  private readFrame(file: File, which: 'first' | 'last'): void {
    if (file.size > 10 * 1024 * 1024) {
      this.streamError.set('图片不能超过 10MB');
      return;
    }
    this.streamError.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) { this.streamError.set('图片读取失败'); return; }

      const img = new Image();
      img.onload = () => {
        const MIN_SIZE = 300;
        let { width, height } = img;
        if (width < MIN_SIZE || height < MIN_SIZE) {
          const scale = Math.max(MIN_SIZE / width, MIN_SIZE / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        if (which === 'first') {
          this.firstFramePreview.set(dataUrl);
          this.firstFrameData.set(dataUrl);
        } else {
          this.lastFramePreview.set(dataUrl);
          this.lastFrameData.set(dataUrl);
        }
      };
      img.onerror = () => { this.streamError.set('图片读取失败'); };
      img.src = result;
    };
    reader.onerror = () => { this.streamError.set('图片读取失败'); };
    reader.readAsDataURL(file);
  }

  private applyConfig(cfg: SeedanceConfig): void {
    if (cfg.aspectRatios.length) {
      this.aspectRatioOptions.set(cfg.aspectRatios);
      if (!cfg.aspectRatios.includes(this.aspectRatio())) {
        this.aspectRatio.set(cfg.aspectRatios[0] ?? '16:9');
      }
    }
    if (cfg.resolutions.length) {
      this.resolutionOptions.set(cfg.resolutions);
      if (!cfg.resolutions.includes(this.resolution())) {
        this.resolution.set(cfg.resolutions[0] ?? '720p');
      }
    }
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
