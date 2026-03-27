import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { VideoShotDto } from '../../../core/models/video-agent.models';

@Component({
  selector: 'app-shot-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="shot-card" [class]="'shot-card shot-card--' + shot.status">
      <div class="shot-card__head">
        <div>
          <span class="shot-card__index">Shot {{ shot.shotIndex }}</span>
          <h3>{{ shot.description }}</h3>
        </div>
        <span class="shot-card__status">{{ statusLabel(shot.status) }}</span>
      </div>

      <div class="shot-card__meta">
        <span>{{ shot.cameraMovement || 'static' }}</span>
        <span>{{ shot.duration || 5 }}s</span>
        <span>{{ shot.aspectRatio || '16:9' }}</span>
        <span>{{ shot.resolution || '720p' }}</span>
      </div>

      @if (shot.finalPrompt) {
        <p class="shot-card__prompt">{{ shot.finalPrompt }}</p>
      }

      @if (shot.videoUrl) {
        <video class="shot-card__video" [src]="shot.videoUrl" controls preload="metadata"></video>
      }

      @if (shot.errorMessage) {
        <p class="shot-card__error">{{ shot.errorMessage }}</p>
      }
    </article>
  `,
  styles: [
    `
      .shot-card {
        padding: 18px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(24, 30, 44, 0.08);
        box-shadow: 0 16px 30px rgba(18, 26, 39, 0.06);
      }

      .shot-card__head {
        display: flex;
        gap: 12px;
        justify-content: space-between;
        align-items: flex-start;
      }

      .shot-card__index {
        display: inline-block;
        margin-bottom: 6px;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #7b5a2d;
      }

      .shot-card h3 {
        margin: 0;
        font-size: 1rem;
        line-height: 1.5;
        color: #1f2937;
      }

      .shot-card__status {
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 0.78rem;
        background: rgba(31, 41, 55, 0.06);
        color: #445066;
        white-space: nowrap;
      }

      .shot-card__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
        color: #5a6472;
        font-size: 0.86rem;
      }

      .shot-card__meta span {
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(245, 208, 138, 0.14);
      }

      .shot-card__prompt {
        margin: 14px 0 0;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(246, 248, 250, 0.9);
        color: #4b5563;
        line-height: 1.65;
      }

      .shot-card__video {
        width: 100%;
        margin-top: 14px;
        border-radius: 16px;
        background: #0f172a;
      }

      .shot-card__error {
        margin: 14px 0 0;
        color: #b42318;
      }

      .shot-card--done {
        border-color: rgba(34, 197, 94, 0.22);
      }

      .shot-card--failed {
        border-color: rgba(220, 38, 38, 0.22);
      }
    `,
  ],
})
export class ShotCardComponent {
  @Input({ required: true }) shot!: VideoShotDto;

  protected statusLabel(status: VideoShotDto['status']): string {
    switch (status) {
      case 'pending':
        return '待处理';
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
