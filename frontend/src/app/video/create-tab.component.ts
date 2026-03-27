import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import { VideoService, type VideoConfig, type VideoTask } from '../core/services/video.service';
import { VideoAgentService } from '../core/services/video-agent.service';
import type { CreativePackageDto, VideoProjectDto, VideoShotDto } from '../core/models/video-agent.models';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { environment } from '../../environments/environment';

type CreateMode = 'text' | 'image' | 'storyboard';

const MODE_LABELS: Record<CreateMode, string> = {
  text: '文本创作',
  image: '图片驱动',
  storyboard: '分镜创作',
};

const PLACEHOLDERS: Record<'text' | 'image', string> = {
  text: '描述你想要的画面，越详细效果越好……例如：城市夜景延时，霓虹灯倒影在湿润路面，镜头缓缓推进',
  image: '描述图片中应该发生的动作（可留空，AI 自动分析画面）',
};

@Component({
  selector: 'app-video-create-tab',
  standalone: true,
  imports: [FormsModule, AppButtonComponent],
  template: `
    <div class="create-tab">
      <!-- Left panel -->
      <aside class="left-panel">
        <!-- Mode switcher -->
        <div class="mode-group">
          @for (m of modes; track m) {
            <button
              type="button"
              class="mode-btn"
              [class.mode-btn--active]="activeMode() === m"
              (click)="activeMode.set(m)"
            >{{ modeLabel(m) }}</button>
          }
        </div>

        <div class="left-scroll">

          <!-- ── TEXT / IMAGE mode inputs ── -->
          @if (activeMode() !== 'storyboard') {

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

            <!-- Image upload (image mode) -->
            @if (activeMode() === 'image') {
              <div class="field">
                <div class="field__head">
                  <span class="field-label">参考图片</span>
                  <label class="toggle-label">
                    <input type="checkbox" [checked]="useKeyframe()" (change)="useKeyframe.set(!useKeyframe())" />
                    <span>首尾帧控制</span>
                  </label>
                </div>

                @if (!useKeyframe()) {
                  <!-- Single image -->
                  <div
                    class="upload-zone"
                    [class.upload-zone--has-image]="firstFramePreview()"
                    (click)="triggerFileInput('first')"
                    (dragover)="$event.preventDefault()"
                    (drop)="handleDrop($event, 'first')"
                  >
                    @if (firstFramePreview()) {
                      <img class="upload-zone__preview" [src]="firstFramePreview()!" alt="参考图预览" />
                      <button type="button" class="upload-zone__clear" (click)="clearFrame('first', $event)">×</button>
                    } @else {
                      <div class="upload-zone__placeholder">
                        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                          <path d="M13 17V9M9 13l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          <rect x="3" y="3" width="20" height="20" rx="4" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.45"/>
                        </svg>
                        <span>点击或拖拽上传图片</span>
                        <span class="upload-hint">JPG / PNG，不超过 10MB</span>
                      </div>
                    }
                  </div>
                } @else {
                  <!-- Keyframe pair -->
                  <div class="keyframe-grid">
                    <div>
                      <div
                        class="upload-zone upload-zone--small"
                        [class.upload-zone--has-image]="firstFramePreview()"
                        (click)="triggerFileInput('first')"
                      >
                        @if (firstFramePreview()) {
                          <img class="upload-zone__preview" [src]="firstFramePreview()!" alt="首帧" />
                          <button type="button" class="upload-zone__clear" (click)="clearFrame('first', $event)">×</button>
                        } @else {
                          <div class="upload-zone__placeholder upload-zone__placeholder--small">
                            <span>首帧</span>
                            <span class="frame-label">START</span>
                          </div>
                        }
                      </div>
                    </div>
                    <div>
                      <div
                        class="upload-zone upload-zone--small"
                        [class.upload-zone--has-image]="lastFramePreview()"
                        (click)="triggerFileInput('last')"
                      >
                        @if (lastFramePreview()) {
                          <img class="upload-zone__preview" [src]="lastFramePreview()!" alt="尾帧" />
                          <button type="button" class="upload-zone__clear" (click)="clearFrame('last', $event)">×</button>
                        } @else {
                          <div class="upload-zone__placeholder upload-zone__placeholder--small">
                            <span>尾帧</span>
                            <span class="frame-label">END</span>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                }

                <input #firstFileInput type="file" accept="image/*" class="file-hidden" (change)="onFileChange($event, 'first')" />
                <input #lastFileInput type="file" accept="image/*" class="file-hidden" (change)="onFileChange($event, 'last')" />
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
              <span class="field-label">时长</span>
              <div class="duration-row">
                <input class="duration-input" type="number" min="1"
                  [max]="durationUnit() === 'seconds' ? 300 : 9000"
                  [ngModel]="duration()"
                  (ngModelChange)="setDuration($event)"
                  [disabled]="submitting()" />
                <div class="chip-group">
                  <label class="chip-option">
                    <input type="radio" name="dunit" value="seconds"
                      [checked]="durationUnit() === 'seconds'"
                      [disabled]="submitting()"
                      (change)="toggleUnit('seconds')" />
                    <span>秒</span>
                  </label>
                  <label class="chip-option">
                    <input type="radio" name="dunit" value="frames"
                      [checked]="durationUnit() === 'frames'"
                      [disabled]="submitting()"
                      (change)="toggleUnit('frames')" />
                    <span>帧</span>
                  </label>
                </div>
              </div>
            </div>
          }

          <!-- ── STORYBOARD mode inputs ── -->
          @if (activeMode() === 'storyboard') {

            <!-- Package selector -->
            <div class="field">
              <span class="field-label">创作资料包 <span class="field-hint">（必选）</span></span>
              @if (packagesLoading()) {
                <div class="hint-text">加载资料包中…</div>
              } @else if (packages().length === 0) {
                <div class="hint-text">
                  暂无资料包，请先
                  <button type="button" class="link-btn" (click)="goToAssets()">创建资料包</button>
                </div>
              } @else {
                <div class="pkg-list">
                  @for (pkg of packages(); track pkg.id) {
                    <button
                      type="button"
                      class="pkg-btn"
                      [class.pkg-btn--active]="selectedPackageId() === pkg.id"
                      (click)="selectedPackageId.set(pkg.id)"
                    >
                      <span class="pkg-btn__name">{{ pkg.name }}</span>
                      @if (pkg.description) {
                        <span class="pkg-btn__desc">{{ pkg.description }}</span>
                      }
                    </button>
                  }
                </div>
              }
            </div>

            <!-- Story brief -->
            <div class="field">
              <div class="field__head">
                <span class="field-label">故事描述</span>
                <span class="char-count">{{ storyBrief().length }}/1000</span>
              </div>
              <textarea
                class="prompt-area prompt-area--tall"
                rows="7"
                maxlength="1000"
                placeholder="描述你的故事情节，AI 会自动拆分为多个镜头……例如：清晨，主角走在迷雾笼罩的森林小径上，远处传来钟声，镜头慢慢拉远"
                [ngModel]="storyBrief()"
                (ngModelChange)="storyBrief.set($event)"
                [disabled]="storyboardSubmitting()"
              ></textarea>
            </div>
          }

        </div><!-- /left-scroll -->

        <!-- Generate button -->
        <div class="generate-area">
          @if (streamError()) {
            <div class="error-bar">{{ streamError() }}</div>
          }
          @if (activeMode() !== 'storyboard') {
            @if (submitting()) {
              <app-button variant="ghost" size="md" (click)="cancel()">取消</app-button>
            }
            <app-button variant="primary" size="md" [disabled]="!canSubmit()" (click)="submit()">
              @if (submitting()) {
                <span class="spinner"></span>生成中…
              } @else {
                生成视频
              }
            </app-button>
          } @else {
            <app-button variant="primary" size="md" [disabled]="!canSubmitStoryboard()" (click)="submitStoryboard()">
              @if (storyboardSubmitting()) {
                <span class="spinner"></span>创作中…
              } @else {
                开始创作
              }
            </app-button>
          }
        </div>

      </aside>

      <!-- Right panel -->
      <main class="right-panel">

        @if (activeMode() !== 'storyboard') {
          <!-- Empty state -->
          @if (!taskId() && !videoStatus()) {
            <div class="result-empty">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="24" stroke="currentColor" stroke-width="1.2" opacity="0.1"/>
                <rect x="16" y="18" width="24" height="20" rx="4" stroke="currentColor" stroke-width="1.3" opacity="0.2"/>
                <path d="M23 28l2.5 2.5 7-7" stroke="url(#emptyGrad)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <defs>
                  <linearGradient id="emptyGrad" x1="23" y1="24" x2="33" y2="31" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#c084fc"/>
                    <stop offset="1" stop-color="#818cf8"/>
                  </linearGradient>
                </defs>
              </svg>
              <p class="result-empty__text">配置参数，开始生成</p>
              <p class="result-empty__sub">首次生成通常需要 30–90 秒</p>
            </div>
          }

          <!-- Pending / running -->
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
              <div class="progress-bar-track">
                <div class="progress-bar-fill progress-bar-fill--indeterminate"></div>
              </div>
              <p class="progress-hint">AI 正在生成中，请稍候……</p>
            </div>
          }

          <!-- Completed -->
          @if (videoStatus()?.status === 'completed' && videoStatus()?.videoUrl) {
            <div class="video-card">
              <video class="video-card__player" controls loop [src]="videoStatus()!.videoUrl!"></video>
              <div class="video-card__footer">
                <span class="video-card__meta">{{ resolution() }} · {{ duration() }}{{ durationUnit() === 'seconds' ? 's' : 'f' }}</span>
                <a class="video-card__dl" [href]="videoStatus()!.videoUrl!" download target="_blank" rel="noreferrer">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 2v7M4 7l2.5 2.5L9 7M2 11h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  下载
                </a>
              </div>
            </div>
          }

          <!-- Failed / cancelled -->
          @if (videoStatus()?.status === 'failed' || videoStatus()?.status === 'cancelled') {
            <div class="result-error">
              <strong>{{ videoStatus()?.status === 'cancelled' ? '任务已取消' : '生成失败' }}</strong>
              <p>{{ videoStatus()?.error || (videoStatus()?.status === 'cancelled' ? '任务已从队列中移除，可重新提交。' : '请重试') }}</p>
              <app-button variant="ghost" size="sm" (click)="retryTracking()">重试</app-button>
            </div>
          }

          @if (taskId()) {
            <div class="task-strip">
              <span class="task-strip__label">任务 ID</span>
              <code class="task-strip__id">{{ taskId() }}</code>
              <button type="button" class="task-strip__refresh" [disabled]="submitting()" (click)="refreshStatus()">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6A4 4 0 0 1 9 3M10 6A4 4 0 0 1 3 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  <path d="M8.5 1.5l.5 1.5-1.5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M3.5 10.5l-.5-1.5 1.5-.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                刷新
              </button>
            </div>
          }
        }

        <!-- ── Storyboard right panel ── -->
        @if (activeMode() === 'storyboard') {
          @if (!storyboardProject()) {
            <div class="result-empty">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <rect x="8" y="12" width="14" height="32" rx="3" stroke="currentColor" stroke-width="1.3" opacity="0.2"/>
                <rect x="26" y="12" width="14" height="32" rx="3" stroke="currentColor" stroke-width="1.3" opacity="0.2"/>
                <path d="M44 16h6M44 28h6M44 36h4" stroke="url(#sbGrad)" stroke-width="1.5" stroke-linecap="round"/>
                <defs>
                  <linearGradient id="sbGrad" x1="44" y1="16" x2="50" y2="36" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#c084fc"/>
                    <stop offset="1" stop-color="#818cf8"/>
                  </linearGradient>
                </defs>
              </svg>
              <p class="result-empty__text">输入故事，AI 自动拆分镜头</p>
              <p class="result-empty__sub">选择资料包后，AI 会根据故事描述规划分镜并逐一生成视频</p>
            </div>
          }

          @if (storyboardProject()) {
            <div class="sb-project">
              <!-- Project header -->
              <div class="sb-header">
                <div class="sb-header__info">
                  <span class="sb-header__name">{{ storyboardProject()!.packageName }}</span>
                  <span class="sb-status sb-status--{{ storyboardProject()!.status }}">{{ projectStatusLabel(storyboardProject()!.status) }}</span>
                </div>
                @if (storyboardProject()!.storyBrief) {
                  <p class="sb-header__brief">{{ storyboardProject()!.storyBrief }}</p>
                }
                <div class="sb-progress-bar-track">
                  <div class="sb-progress-bar-fill" [style.width.%]="storyboardProject()!.progress"></div>
                </div>
                <span class="sb-progress-text">{{ storyboardProject()!.progress }}% · {{ storyboardProject()!.shots.length }} 个镜头</span>
              </div>

              <!-- Shot list -->
              @if (storyboardProject()!.status === 'planning' && storyboardProject()!.shots.length === 0) {
                <div class="sb-planning">
                  <span class="pulse-dot"></span>
                  AI 正在规划镜头…
                </div>
              }

              <div class="sb-shots">
                @for (shot of storyboardProject()!.shots; track shot.id) {
                  <div class="shot-card" [class.shot-card--done]="shot.status === 'done'">
                    <div class="shot-card__index">{{ shot.shotIndex + 1 }}</div>
                    <div class="shot-card__body">
                      <p class="shot-card__desc">{{ shot.description }}</p>
                      @if (shot.cameraMovement) {
                        <p class="shot-card__meta">镜头：{{ shot.cameraMovement }}</p>
                      }
                      <span class="shot-status shot-status--{{ shot.status }}">{{ shotStatusLabel(shot.status) }}</span>
                    </div>
                    <div class="shot-card__media">
                      @if (shot.status === 'generating') {
                        <div class="shot-spinner"></div>
                      }
                      @if (shot.status === 'done' && shot.videoUrl) {
                        <video class="shot-video" [src]="shot.videoUrl" muted loop preload="metadata" (mouseenter)="playVideo($event)" (mouseleave)="pauseVideo($event)"></video>
                        <a class="shot-dl" [href]="shot.videoUrl" download target="_blank" rel="noreferrer">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M6 2v6M4 6.5L6 8.5 8 6.5M2 10h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                          </svg>
                        </a>
                      }
                      @if (shot.status === 'failed') {
                        <div class="shot-failed">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
                            <path d="M8 5v4M8 10.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                          </svg>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        }

      </main>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .create-tab {
      display: flex;
      flex: 1;
      gap: var(--space-4);
      min-height: 0;
      padding: var(--workbench-shell-padding, 1.5rem);
      overflow: hidden;
    }

    /* ── Left Panel ── */
    .left-panel {
      width: 340px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      border-radius: var(--workbench-panel-radius, var(--radius-xl));
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

    /* ── Mode switcher ── */
    .mode-group {
      display: flex;
      gap: var(--space-1);
      padding: 3px;
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--color-border-light) 60%, transparent);
      flex-shrink: 0;
    }

    .mode-btn {
      flex: 1;
      padding: var(--space-2) var(--space-2);
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

    .mode-btn--active {
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

    .field-hint {
      font-weight: var(--font-weight-normal);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }

    .char-count {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .hint-text {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }

    .link-btn {
      background: none;
      border: none;
      color: var(--color-primary);
      cursor: pointer;
      font-size: inherit;
      padding: 0;
      text-decoration: underline;
    }

    .prompt-area {
      width: 100%;
      min-height: 110px;
      max-height: 220px;
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

    .prompt-area--tall {
      min-height: 160px;
      max-height: 300px;
    }

    .prompt-area:focus {
      outline: none;
      border-color: color-mix(in srgb, #c084fc 50%, var(--color-border));
      box-shadow: 0 0 0 3px color-mix(in srgb, #c084fc 10%, transparent);
    }

    /* ── Toggle ── */
    .toggle-label {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      cursor: pointer;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .toggle-label input {
      accent-color: #c084fc;
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
      aspect-ratio: 1/1;
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

    .file-hidden { display: none; }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: var(--color-border-light);
      opacity: 0.6;
    }

    /* ── Ratio ── */
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
      padding: 5px 9px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      background: color-mix(in srgb, var(--color-surface) 80%, transparent);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      cursor: pointer;
      transition: all 160ms ease;
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

    /* ── Chips ── */
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
      padding: 4px 12px;
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
      width: 76px;
      padding: 5px 9px;
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

    /* ── Package selector ── */
    .pkg-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .pkg-btn {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: color-mix(in srgb, var(--color-surface) 70%, transparent);
      text-align: left;
      cursor: pointer;
      transition: all 160ms ease;
    }

    .pkg-btn:hover {
      border-color: color-mix(in srgb, #c084fc 30%, var(--color-border));
      background: color-mix(in srgb, #c084fc 4%, var(--color-surface));
    }

    .pkg-btn--active {
      border-color: color-mix(in srgb, #c084fc 55%, var(--color-border));
      background: color-mix(in srgb, #c084fc 10%, var(--color-surface));
    }

    .pkg-btn__name {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    .pkg-btn__desc {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
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
      width: 13px;
      height: 13px;
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
      border-radius: var(--workbench-panel-radius, var(--radius-xl));
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
      max-width: 38ch;
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
      flex-shrink: 0;
    }

    .task-id {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      background: color-mix(in srgb, var(--color-surface) 80%, transparent);
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--color-border-light);
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

    /* Video card */
    .video-card {
      border-radius: var(--radius-xl);
      border: 1px solid var(--color-border-light);
      overflow: hidden;
      background: var(--color-surface);
    }

    .video-card__player {
      width: 100%;
      display: block;
      max-height: 460px;
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

    .video-card__dl {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-size-xs);
      color: var(--color-primary);
      text-decoration: none;
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
      background: color-mix(in srgb, var(--color-primary) 6%, transparent);
      transition: background 160ms ease;
    }

    .video-card__dl:hover {
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

    .result-error strong { color: var(--color-error); font-size: var(--font-size-md); }
    .result-error p { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 1.6; }

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

    .task-strip__label { font-size: var(--font-size-xs); color: var(--color-text-muted); flex-shrink: 0; }
    .task-strip__id { flex: 1; font-size: var(--font-size-xs); color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-strip__refresh { display: flex; align-items: center; gap: 4px; border: none; background: transparent; color: var(--color-primary); font-size: var(--font-size-xs); cursor: pointer; padding: 0; }
    .task-strip__refresh:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Storyboard project panel ── */
    .sb-project {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .sb-header {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-xl);
      border: 1px solid var(--color-border-light);
      background: color-mix(in srgb, var(--color-surface) 70%, transparent);
    }

    .sb-header__info {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .sb-header__name {
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      font-size: var(--font-size-md);
    }

    .sb-header__brief {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }

    .sb-status {
      font-size: var(--font-size-xs);
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      font-weight: var(--font-weight-medium);
    }

    .sb-status--planning { background: color-mix(in srgb, #c084fc 10%, transparent); color: #c084fc; border: 1px solid color-mix(in srgb, #c084fc 22%, transparent); }
    .sb-status--generating { background: color-mix(in srgb, #f59e0b 10%, transparent); color: #f59e0b; border: 1px solid color-mix(in srgb, #f59e0b 22%, transparent); }
    .sb-status--done { background: color-mix(in srgb, #34d399 10%, transparent); color: #34d399; border: 1px solid color-mix(in srgb, #34d399 22%, transparent); }
    .sb-status--failed { background: var(--color-error-bg); color: var(--color-error); border: 1px solid var(--color-error-border); }

    .sb-progress-bar-track {
      height: 3px;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, #c084fc 16%, var(--color-border-light));
      overflow: hidden;
    }

    .sb-progress-bar-fill {
      height: 100%;
      border-radius: var(--radius-pill);
      background: linear-gradient(90deg, #c084fc, #818cf8);
      transition: width 400ms ease;
    }

    .sb-progress-text {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .sb-planning {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-lg);
      border: 1px solid color-mix(in srgb, #c084fc 15%, var(--color-border-light));
      background: color-mix(in srgb, #c084fc 4%, var(--color-surface));
    }

    /* Shot cards */
    .sb-shots {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .shot-card {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border-light);
      background: color-mix(in srgb, var(--color-surface) 60%, transparent);
      transition: border-color 160ms ease;
    }

    .shot-card--done {
      border-color: color-mix(in srgb, #34d399 20%, var(--color-border-light));
    }

    .shot-card__index {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, #c084fc 12%, var(--color-surface));
      border: 1px solid color-mix(in srgb, #c084fc 20%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: #c084fc;
      flex-shrink: 0;
    }

    .shot-card__body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .shot-card__desc {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text);
      line-height: 1.5;
    }

    .shot-card__meta {
      margin: 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .shot-status {
      font-size: var(--font-size-xs);
      padding: 1px 7px;
      border-radius: var(--radius-pill);
      font-weight: var(--font-weight-medium);
      align-self: flex-start;
    }

    .shot-status--pending { background: color-mix(in srgb, var(--color-border) 30%, transparent); color: var(--color-text-muted); border: 1px solid var(--color-border-light); }
    .shot-status--generating { background: color-mix(in srgb, #c084fc 10%, transparent); color: #c084fc; border: 1px solid color-mix(in srgb, #c084fc 22%, transparent); }
    .shot-status--done { background: color-mix(in srgb, #34d399 10%, transparent); color: #34d399; border: 1px solid color-mix(in srgb, #34d399 22%, transparent); }
    .shot-status--failed { background: var(--color-error-bg); color: var(--color-error); border: 1px solid var(--color-error-border); }

    .shot-card__media {
      width: 88px;
      flex-shrink: 0;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .shot-spinner {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, #c084fc 30%, var(--color-border));
      border-top-color: #c084fc;
      animation: spin 700ms linear infinite;
    }

    .shot-video {
      width: 88px;
      height: 58px;
      object-fit: cover;
      border-radius: var(--radius-sm);
      display: block;
      cursor: pointer;
    }

    .shot-dl {
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 22px;
      height: 22px;
      border-radius: var(--radius-sm);
      background: rgba(0,0,0,0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      text-decoration: none;
    }

    .shot-failed {
      color: var(--color-error);
      opacity: 0.7;
    }

    /* ── Animations ── */
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
    @keyframes indeterminate { 0% { transform: translateX(-250%); } 100% { transform: translateX(350%); } }

    @media (max-width: 900px) {
      .create-tab { flex-direction: column; overflow-y: auto; }
      .left-panel { width: 100%; }
      .right-panel { min-height: 400px; }
    }

    @media (max-width: 768px) {
      .create-tab { padding: var(--workbench-shell-padding-mobile, 1rem); }
    }
  `],
})
export class CreateTabComponent implements OnInit, OnDestroy {
  private readonly videoService = inject(VideoService);
  private readonly videoAgentService = inject(VideoAgentService);
  private readonly router = inject(Router);
  private streamSub: Subscription | null = null;
  private pollSub: Subscription | null = null;

  // ── Mode ──
  protected readonly activeMode = signal<CreateMode>('text');
  protected readonly modes: CreateMode[] = ['text', 'image', 'storyboard'];

  // ── Text / Image form ──
  protected readonly prompt = signal('');
  protected readonly useKeyframe = signal(false);
  protected readonly aspectRatio = signal('16:9');
  protected readonly resolution = signal('720p');
  protected readonly duration = signal(5);
  protected readonly durationUnit = signal<'seconds' | 'frames'>('seconds');
  protected readonly aspectRatioOptions = signal<string[]>(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);
  protected readonly resolutionOptions = signal<string[]>(['480p', '720p', '1080p']);
  protected readonly firstFramePreview = signal<string | null>(null);
  protected readonly lastFramePreview = signal<string | null>(null);
  protected readonly firstFrameData = signal<string | null>(null);
  protected readonly lastFrameData = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly taskId = signal<string | null>(null);
  protected readonly videoStatus = signal<VideoTask | null>(null);
  protected readonly streamError = signal<string | null>(null);

  // ── Storyboard form ──
  protected readonly storyBrief = signal('');
  protected readonly selectedPackageId = signal<string | null>(null);
  protected readonly packages = signal<CreativePackageDto[]>([]);
  protected readonly packagesLoading = signal(false);
  protected readonly storyboardProject = signal<VideoProjectDto | null>(null);
  protected readonly storyboardSubmitting = signal(false);

  // ── Computed ──
  protected readonly promptPlaceholder = computed(
    () => PLACEHOLDERS[this.activeMode() === 'image' ? 'image' : 'text'],
  );

  protected readonly canSubmit = computed(
    () => this.prompt().trim().length > 0 && !this.submitting(),
  );

  protected readonly canSubmitStoryboard = computed(
    () =>
      this.storyBrief().trim().length > 0 &&
      this.selectedPackageId() !== null &&
      !this.storyboardSubmitting(),
  );

  ngOnInit(): void {
    this.videoService.getConfig().subscribe({
      next: (cfg) => this.applyConfig(cfg),
      error: () => { /* use defaults */ },
    });
    this.loadPackages();
  }

  ngOnDestroy(): void {
    this.stopStream();
    this.stopPoll();
  }

  protected modeLabel(m: CreateMode): string {
    return MODE_LABELS[m];
  }

  // ── Text/Image submit ──
  protected submit(): void {
    if (!this.canSubmit()) return;
    this.stopStream();
    this.submitting.set(true);
    this.taskId.set(null);
    this.videoStatus.set(null);
    this.streamError.set(null);

    const mode = this.activeMode() === 'image'
      ? (this.useKeyframe() ? 'keyframe' : 'image')
      : 'text';

    this.videoService.createTask({
      prompt: this.prompt().trim(),
      mode,
      aspectRatio: this.aspectRatio(),
      resolution: this.resolution(),
      duration: this.duration(),
      durationUnit: this.durationUnit(),
      firstFrameImage: this.firstFrameData() ?? undefined,
      lastFrameImage: mode === 'keyframe' ? (this.lastFrameData() ?? undefined) : undefined,
    }).subscribe({
      next: (task) => {
        this.taskId.set(task.taskId);
        this.videoStatus.set(task);
        this.startStream(task.taskId);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.streamError.set(this.describeError(err, '提交失败'));
      },
    });
  }

  protected cancel(): void {
    const id = this.taskId();
    if (!id) return;
    this.videoService.cancelTask(id).subscribe({
      next: (task) => {
        this.videoStatus.set(task);
        this.submitting.set(false);
        this.stopStream();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.streamError.set(this.describeError(err, '取消失败'));
      },
    });
  }

  protected refreshStatus(): void {
    const id = this.taskId();
    if (!id) return;
    this.submitting.set(true);
    this.streamError.set(null);
    this.videoService.getTask(id).subscribe({
      next: (s) => {
        this.videoStatus.set(s);
        if (s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled') {
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

  protected retryTracking(): void {
    if (this.taskId()) { this.refreshStatus(); return; }
    this.submit();
  }

  // ── Storyboard submit ──
  protected submitStoryboard(): void {
    if (!this.canSubmitStoryboard()) return;
    this.storyboardSubmitting.set(true);
    this.storyboardProject.set(null);
    this.streamError.set(null);
    this.stopPoll();

    this.videoAgentService.createProject({
      packageId: this.selectedPackageId()!,
      storyBrief: this.storyBrief().trim(),
    }).subscribe({
      next: (project) => {
        this.storyboardProject.set(project);
        this.startPoll(project.id);
      },
      error: (err: unknown) => {
        this.storyboardSubmitting.set(false);
        this.streamError.set(this.describeError(err, '创建项目失败'));
      },
    });
  }

  protected goToAssets(): void {
    void this.router.navigate(['/video'], { queryParams: { tab: 'assets' } });
  }

  // ── Upload ──
  protected triggerFileInput(which: 'first' | 'last'): void {
    const inputs = document.querySelectorAll<HTMLInputElement>('.left-panel .file-hidden');
    if (which === 'first' && inputs[0]) inputs[0].click();
    if (which === 'last' && inputs[1]) inputs[1].click();
  }

  protected handleDrop(event: DragEvent, which: 'first' | 'last'): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.processImageFile(file, which);
  }

  protected onFileChange(event: Event, which: 'first' | 'last'): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.processImageFile(file, which);
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
    this.duration.set(unit === 'frames' ? val * 24 : Math.max(1, Math.round(val / 24)));
    this.durationUnit.set(unit);
  }

  protected ratioStyle(ratio: string): Record<string, string> {
    const [w, h] = ratio.split(':').map(Number);
    const base = 13;
    const scale = Math.min(base / w, base / h);
    return { width: `${Math.round(w * scale)}px`, height: `${Math.round(h * scale)}px` };
  }

  protected statusText(s: VideoTask | null): string {
    switch (s?.status) {
      case 'pending': return '排队中';
      case 'running': return '生成中';
      default: return '等待提交';
    }
  }

  protected shortTaskId(): string {
    const id = this.taskId();
    if (!id) return '';
    return id.length > 12 ? id.slice(0, 8) + '…' : id;
  }

  protected projectStatusLabel(status: VideoProjectDto['status']): string {
    const map: Record<VideoProjectDto['status'], string> = {
      planning: '规划中',
      generating: '生成中',
      done: '已完成',
      failed: '失败',
    };
    return map[status];
  }

  protected shotStatusLabel(status: VideoShotDto['status']): string {
    const map: Record<VideoShotDto['status'], string> = {
      pending: '等待',
      generating: '生成中',
      done: '完成',
      failed: '失败',
    };
    return map[status];
  }

  protected playVideo(event: Event): void {
    (event.target as HTMLVideoElement).play().catch(() => { /* ignore */ });
  }

  protected pauseVideo(event: Event): void {
    (event.target as HTMLVideoElement).pause();
  }

  // ── Private: stream ──
  private startStream(taskId: string): void {
    this.stopStream();
    this.streamSub = this.videoService.streamTask(taskId).subscribe({
      next: (s) => {
        this.videoStatus.set(s);
        this.streamError.set(null);
        if (s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled') {
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
    this.streamSub?.unsubscribe();
    this.streamSub = null;
  }

  // ── Private: poll storyboard project ──
  private startPoll(projectId: string): void {
    this.stopPoll();
    this.pollSub = interval(3000).pipe(
      switchMap(() => this.videoAgentService.getProject(projectId)),
      takeWhile((project) => project.status !== 'done' && project.status !== 'failed', true),
    ).subscribe({
      next: (project) => {
        this.storyboardProject.set(project);
        if (project.status === 'done' || project.status === 'failed') {
          this.storyboardSubmitting.set(false);
          this.stopPoll();
        }
      },
      error: () => {
        this.storyboardSubmitting.set(false);
        this.stopPoll();
      },
    });
  }

  private stopPoll(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  private loadPackages(): void {
    this.packagesLoading.set(true);
    this.videoAgentService.listPackages().subscribe({
      next: (pkgs) => {
        this.packages.set(pkgs);
        this.packagesLoading.set(false);
      },
      error: () => this.packagesLoading.set(false),
    });
  }

  private processImageFile(file: File, which: 'first' | 'last'): void {
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
        const MIN = 300;
        let { width, height } = img;
        if (width < MIN || height < MIN) {
          const scale = Math.max(MIN / width, MIN / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
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

  private applyConfig(cfg: VideoConfig): void {
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
