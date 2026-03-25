import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { AssistantMessage } from '../dev-agent.view-model';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppButtonComponent } from '../../shared/ui/app-button.component';

@Component({
  selector: 'app-assistant-message',
  standalone: true,
  imports: [AppBadgeComponent, AppButtonComponent],
  template: `
    <article class="message assistant">
      <div class="meta">
        <span class="label">{{ message.tone === 'summary' ? '回复' : 'Assistant' }}</span>
        @if (message.tone === 'summary' && message.status) {
          @if (message.status === 'failed') {
            <app-badge tone="danger" [caps]="true" size="sm">Failed</app-badge>
          } @else if (message.status === 'success') {
            <app-badge tone="success" [caps]="true" size="sm">Done</app-badge>
          }
        }
        @if (message.tone === 'progress' && message.status) {
          <app-badge [tone]="statusTone(message.status)" [caps]="true" size="sm">
            {{ statusLabel(message.status) }}
          </app-badge>
        }
        @if (elapsedLabel) {
          <span class="elapsed">{{ elapsedLabel }}</span>
        }
      </div>
      <div
        class="bubble"
        [class.progress]="message.tone === 'progress'"
        [class.running]="message.tone === 'progress' && message.status === 'running'"
        [class.summary]="message.tone === 'summary'"
      >
        @if (message.tone === 'progress' && message.status === 'running') {
          <span class="spinner" aria-hidden="true"></span>
        }
        {{ message.text }}
      </div>
      @if (message.tone === 'summary' && message.status === 'failed' && canRetry) {
        <div class="retry-row">
          <app-button variant="ghost" size="sm" (click)="retryClick.emit()">重试</app-button>
        </div>
      }
    </article>
  `,
  styles: [`
    .message {
      max-width: min(var(--workbench-message-measure), var(--workbench-message-max-width));
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .label {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .elapsed {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
    }

    .bubble {
      padding: var(--workbench-message-padding);
      border-radius: var(--workbench-card-radius);
      background: var(--dev-agent-assistant-bg);
      border: 1px solid var(--dev-agent-assistant-border);
      color: var(--color-text);
      font-size: var(--font-size-sm);
      line-height: 1.62;
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: var(--chat-bubble-shadow);
    }

    .bubble.summary {
      background: var(--color-surface);
      border-color: var(--color-border-light);
      font-size: var(--font-size-md);
    }

    .bubble.progress {
      background: var(--dev-agent-assistant-progress-bg);
    }

    .bubble.running {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }

    .spinner {
      width: 0.72rem;
      height: 0.72rem;
      border-radius: var(--radius-pill);
      border: 2px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
      border-top-color: var(--color-primary);
      animation: assistant-spin 0.9s linear infinite;
      flex-shrink: 0;
    }

    @keyframes assistant-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .retry-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-1);
    }
  `],
})
export class AssistantMessageComponent implements OnInit, OnDestroy {
  @Input({ required: true }) message!: AssistantMessage;
  @Input() canRetry = false;
  @Output() retryClick = new EventEmitter<void>();

  protected elapsedLabel = '';
  private timerSub: Subscription | null = null;

  ngOnInit() {
    if (this.message.status === 'running' && this.message.timestamp) {
      this.updateElapsed();
      this.timerSub = interval(1000).subscribe(() => this.updateElapsed());
    }
  }

  ngOnDestroy() {
    this.timerSub?.unsubscribe();
  }

  private updateElapsed() {
    const start = Date.parse(this.message.timestamp!);
    if (!Number.isFinite(start)) return;
    const secs = Math.max(0, Math.floor((Date.now() - start) / 1000));
    this.elapsedLabel = secs < 60
      ? `${secs}s`
      : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  protected statusLabel(status: AssistantMessage['status']): string {
    if (status === 'running') return 'Running';
    if (status === 'success') return 'Success';
    if (status === 'failed') return 'Failed';
    return '';
  }

  protected statusTone(status: AssistantMessage['status']) {
    if (status === 'running') return 'warning';
    if (status === 'success') return 'success';
    if (status === 'failed') return 'danger';
    return 'neutral';
  }
}
