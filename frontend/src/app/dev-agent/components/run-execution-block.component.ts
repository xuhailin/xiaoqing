import { Component, Input, OnChanges, OnInit, SimpleChanges, signal } from '@angular/core';
import { AssistantMessage, ToolCallMessage, ToolResultMessage } from '../dev-agent.view-model';
import { ToolCallMessageComponent } from './tool-call-message.component';
import { ToolResultMessageComponent } from './tool-result-message.component';

@Component({
  selector: 'app-run-execution-block',
  standalone: true,
  imports: [ToolCallMessageComponent, ToolResultMessageComponent],
  template: `
    <div class="exec-block" [class.is-running]="isRunning">
      <button
        type="button"
        class="exec-header"
        [disabled]="!hasSteps"
        (click)="toggle()"
      >
        <span class="exec-icon" aria-hidden="true">
          @if (isRunning) {
            <span class="spinner"></span>
          } @else {
            ⚙️
          }
        </span>
        <span class="header-text">
          @if (isRunning) {
            执行中
            @if (steps.length) { · {{ steps.length }} 个步骤 }
          } @else {
            查看执行详情 · {{ steps.length }} 个步骤
            @if (failedCount > 0) {
              <span class="failed-hint"> · {{ failedCount }} 失败</span>
            }
          }
        </span>
        @if (hasSteps) {
          <span class="toggle-hint">{{ expanded() ? '↑' : '↓' }}</span>
        }
      </button>

      @if (isRunning && expanded() && steps.length) {
        <div class="live-steps">
          @for (step of steps; track step.id) {
            <div class="live-step-line" [class.active]="step.status === 'running'">
              <span class="bullet" aria-hidden="true">
                @if (step.status === 'running') {
                  <span class="mini-spinner"></span>
                } @else {
                  ·
                }
              </span>
              <span class="live-step-text">{{ step.summary }}</span>
            </div>
          }
        </div>
      }

      @if (!isRunning && expanded() && hasSteps) {
        <div class="detail-steps">
          @for (step of steps; track step.id) {
            @if (step.kind === 'tool-call') {
              <app-tool-call-message [message]="step" />
            } @else {
              <app-tool-result-message [message]="step" />
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .exec-block {
      max-width: min(var(--workbench-message-measure), var(--workbench-message-max-width));
      border: 1px solid var(--chat-work-card-border);
      border-radius: var(--radius-md);
      background: var(--chat-work-card-bg);
      overflow: hidden;
    }

    .exec-block.is-running {
      border-color: color-mix(in srgb, var(--color-primary) 24%, var(--chat-work-card-border));
    }

    .exec-header {
      width: 100%;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: none;
      background: transparent;
      cursor: pointer;
      font-family: var(--font-family);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      text-align: left;
    }

    .exec-header:disabled {
      cursor: default;
    }

    .exec-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      flex-shrink: 0;
      font-size: 12px;
      line-height: 1;
    }

    .spinner {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: var(--radius-pill);
      border: 1.5px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
      border-top-color: var(--color-primary);
      animation: spin 0.9s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .header-text {
      flex: 1;
      min-width: 0;
    }

    .failed-hint {
      color: var(--color-error);
    }

    .toggle-hint {
      font-size: 10px;
      color: var(--color-text-muted);
      flex-shrink: 0;
      white-space: nowrap;
    }

    .live-steps {
      padding: 0 var(--space-3) var(--space-2) calc(var(--space-3) + 1rem);
      border-top: 1px solid var(--color-border-light);
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .live-step-line {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      padding-top: 3px;
      font-size: var(--font-size-xxs);
      color: var(--color-text-muted);
    }

    .live-step-line.active {
      color: var(--color-text-secondary);
    }

    .bullet {
      flex-shrink: 0;
      font-size: 10px;
      line-height: 1;
      display: flex;
      align-items: center;
    }

    .mini-spinner {
      display: inline-block;
      width: 0.45rem;
      height: 0.45rem;
      border-radius: var(--radius-pill);
      border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
      border-top-color: var(--color-primary);
      animation: spin 0.9s linear infinite;
    }

    .live-step-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .detail-steps {
      padding: var(--space-2) var(--space-3);
      border-top: 1px solid var(--color-border-light);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
  `],
})
export class RunExecutionBlockComponent implements OnInit, OnChanges {
  @Input() steps: (ToolCallMessage | ToolResultMessage)[] = [];
  @Input() progressMessage: AssistantMessage | null = null;
  @Input() isRunning = false;

  readonly expanded = signal(false);

  get hasSteps(): boolean {
    return this.steps.length > 0;
  }

  get failedCount(): number {
    return this.steps.filter(s => s.status === 'failed').length;
  }

  ngOnInit() {
    this.expanded.set(this.isRunning);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isRunning'] && !changes['isRunning'].firstChange) {
      const wasRunning = changes['isRunning'].previousValue as boolean;
      const nowRunning = changes['isRunning'].currentValue as boolean;
      if (wasRunning && !nowRunning) {
        this.expanded.set(false);
      }
    }
  }

  toggle() {
    if (!this.hasSteps) return;
    this.expanded.update(v => !v);
  }
}
