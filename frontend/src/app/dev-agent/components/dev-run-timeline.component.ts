import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DevTaskResult } from '../../core/services/dev-agent.service';
import { DevTimelineStep } from '../dev-agent.view-model';

@Component({
  selector: 'app-dev-run-timeline',
  standalone: true,
  template: `
    <section class="timeline-pane">
      @if (!task) {
        <div class="empty">
          <h4>执行流</h4>
          <p>从左侧选择 run，或在下方输入任务后开始执行。</p>
        </div>
      } @else {
        <header class="run-header">
          <div class="title-row">
            <span class="status-dot" [class]="task.run.status"></span>
            <h3>{{ task.reply }}</h3>
          </div>
          <div class="meta-row">
            <span class="meta">run {{ task.run.id.slice(0, 8) }}</span>
            <span class="meta">{{ task.run.status }}</span>
            @if (task.run.executor) {
              <span class="meta">{{ task.run.executor }}</span>
            }
            @if (isCancellable) {
              <button
                type="button"
                class="cancel-btn"
                [disabled]="cancelling"
                (click)="cancel.emit()"
              >
                {{ cancelling ? '取消中...' : '取消任务' }}
              </button>
            }
            <button
              type="button"
              class="action-btn"
              (click)="rerun.emit()"
            >
              新建 Rerun
            </button>
            @if (hasFailedStep) {
              <button
                type="button"
                class="action-btn"
                (click)="jumpToFailed.emit()"
              >
                跳到失败步骤
              </button>
            }
          </div>
        </header>

        <div class="timeline-list">
          @if (steps.length === 0) {
            <div class="event-empty">暂无可展示的步骤。任务执行中时会实时刷新。</div>
          } @else {
            @for (step of steps; track step.id) {
              <button
                type="button"
                class="event-card"
                [class.selected]="selectedStepId === step.id"
                [class.failed]="step.status === 'failed'"
                (click)="stepSelect.emit(step.id)"
              >
                <div class="event-head">
                  <span class="pill" [class]="step.status">{{ statusLabel(step.status) }}</span>
                  <span class="executor">{{ step.executor }}</span>
                  @if (step.strategy) {
                    <span class="strategy">{{ step.strategy }}</span>
                  }
                </div>
                <div class="event-title">{{ step.title }}</div>
                <code>{{ step.command }}</code>
                @if (step.error) {
                  <div class="preview error">{{ step.error }}</div>
                } @else if (step.output) {
                  <div class="preview">{{ step.output }}</div>
                }
              </button>
            }
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .timeline-pane {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: #fff;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .empty {
      padding: var(--space-4);
      color: var(--color-text-secondary);
    }

    .empty h4 {
      margin: 0 0 var(--space-2);
      color: var(--color-text);
    }

    .empty p {
      margin: 0;
      font-size: var(--font-size-sm);
      line-height: var(--line-height-base);
    }

    .run-header {
      border-bottom: 1px solid var(--color-border);
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      background: linear-gradient(180deg, rgba(250, 249, 246, 0.6), #fff);
    }

    .title-row {
      display: flex;
      align-items: start;
      gap: var(--space-2);
    }

    .title-row h3 {
      margin: 0;
      font-size: var(--font-size-sm);
      line-height: 1.5;
      font-weight: var(--font-weight-semibold);
    }

    .meta-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .meta {
      font-size: 10px;
      color: var(--color-text-secondary);
      background: var(--color-bg);
      border-radius: var(--radius-pill);
      padding: 2px var(--space-2);
    }

    .cancel-btn {
      margin-left: auto;
      border: 1px solid #e74c3c;
      border-radius: var(--radius-sm);
      background: rgba(231, 76, 60, 0.08);
      color: #c0392b;
      font-size: 11px;
      padding: 3px var(--space-2);
      cursor: pointer;
    }

    .cancel-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .action-btn {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: #fff;
      color: var(--color-text-secondary);
      font-size: 11px;
      padding: 3px var(--space-2);
      cursor: pointer;
    }

    .timeline-list {
      padding: var(--space-3);
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 0;
    }

    .event-card {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: #fff;
      padding: var(--space-2);
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 6px;
      cursor: pointer;
      font-family: var(--font-family);
    }

    .event-card.selected {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 1px rgba(92, 103, 242, 0.22);
    }

    .event-card.failed {
      border-color: rgba(231, 76, 60, 0.45);
      background: rgba(254, 242, 242, 0.5);
    }

    .event-head {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      flex-wrap: wrap;
    }

    .pill {
      font-size: 10px;
      border-radius: var(--radius-pill);
      padding: 1px var(--space-2);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      background: #fff;
    }

    .pill.success {
      border-color: #27ae60;
      color: #1f8a4d;
    }

    .pill.failed {
      border-color: #e74c3c;
      color: #c0392b;
    }

    .pill.running {
      border-color: #f39c12;
      color: #b9770e;
    }

    .executor,
    .strategy {
      font-size: 10px;
      color: var(--color-text-secondary);
    }

    .event-title {
      font-size: var(--font-size-xs);
      color: var(--color-text);
      font-weight: var(--font-weight-medium);
    }

    code {
      font-size: 11px;
      background: var(--color-bg);
      border-radius: var(--radius-sm);
      padding: 4px var(--space-1);
      color: var(--color-text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .preview {
      font-size: 11px;
      color: var(--color-text-secondary);
      white-space: pre-wrap;
      line-height: 1.45;
      max-height: 92px;
      overflow: auto;
    }

    .preview.error {
      color: #c0392b;
    }

    .event-empty {
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      padding: var(--space-3);
      text-align: center;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #7f8c8d;
    }

    .status-dot.running,
    .status-dot.pending,
    .status-dot.queued {
      background: #f39c12;
    }

    .status-dot.success {
      background: #27ae60;
    }

    .status-dot.failed {
      background: #e74c3c;
    }
  `],
})
export class DevRunTimelineComponent {
  @Input() task: DevTaskResult | null = null;
  @Input() steps: DevTimelineStep[] = [];
  @Input() selectedStepId: string | null = null;
  @Input() isCancellable = false;
  @Input() cancelling = false;
  @Input() hasFailedStep = false;

  @Output() stepSelect = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();
  @Output() rerun = new EventEmitter<void>();
  @Output() jumpToFailed = new EventEmitter<void>();

  statusLabel(status: DevTimelineStep['status']): string {
    if (status === 'success') return '成功';
    if (status === 'failed') return '失败';
    if (status === 'running') return '进行中';
    return '计划中';
  }
}
