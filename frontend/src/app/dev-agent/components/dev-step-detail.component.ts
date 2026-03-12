import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DevTimelineStep } from '../dev-agent.view-model';

@Component({
  selector: 'app-dev-step-detail',
  standalone: true,
  template: `
    <section class="detail-pane">
      <header class="detail-header">
        <h3>步骤详情</h3>
        <div class="actions">
          <button
            type="button"
            class="action-btn"
            [disabled]="!step?.command"
            (click)="copyCommand.emit()"
          >
            复制命令
          </button>
          <button
            type="button"
            class="action-btn"
            [disabled]="!hasFailureContext"
            (click)="copyFailureSummary.emit()"
          >
            复制错误摘要
          </button>
        </div>
      </header>

      @if (step) {
        <div class="detail-body">
          <div class="row">
            <span class="label">状态</span>
            <span class="value">{{ statusLabel(step.status) }}</span>
          </div>
          <div class="row">
            <span class="label">执行器</span>
            <span class="value">{{ step.executor }}</span>
          </div>
          @if (step.strategy) {
            <div class="row">
              <span class="label">策略</span>
              <span class="value">{{ step.strategy }}</span>
            </div>
          }
          <div class="row column">
            <span class="label">命令</span>
            <code>{{ step.command }}</code>
          </div>
          @if (step.output) {
            <div class="row column">
              <span class="label">输出</span>
              <pre>{{ step.output }}</pre>
            </div>
          }
          @if (step.error) {
            <div class="row column">
              <span class="label">错误</span>
              <pre class="error">{{ step.error }}</pre>
            </div>
          }
        </div>
      } @else {
        <div class="empty">
          @if (runStatus) {
            <div class="line">当前运行状态：{{ runStatus }}</div>
          }
          @if (stopReason) {
            <div class="line">停止原因：{{ stopReason }}</div>
          }
          @if (runError) {
            <div class="line error">错误：{{ runError }}</div>
          }
          @if (!runStatus && !stopReason && !runError) {
            <div class="line">选择中间执行流中的步骤以查看详细信息。</div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .detail-pane {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: #fff;
      overflow: hidden;
    }

    .detail-header {
      padding: var(--space-3);
      border-bottom: 1px solid var(--color-border);
      background: linear-gradient(180deg, rgba(250, 249, 246, 0.6), #fff);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .detail-header h3 {
      margin: 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: var(--space-1);
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

    .action-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .detail-body {
      padding: var(--space-3);
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .row {
      display: grid;
      grid-template-columns: 56px 1fr;
      gap: var(--space-2);
      align-items: start;
      font-size: var(--font-size-xs);
    }

    .row.column {
      grid-template-columns: 1fr;
    }

    .label {
      color: var(--color-text-secondary);
    }

    .value {
      color: var(--color-text);
      font-weight: var(--font-weight-medium);
      word-break: break-word;
    }

    code,
    pre {
      margin: 0;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border-light);
      background: var(--color-bg);
      padding: var(--space-2);
      font-size: 11px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--color-text);
      max-height: 280px;
      overflow: auto;
    }

    pre.error {
      border-color: rgba(231, 76, 60, 0.35);
      color: #c0392b;
      background: rgba(254, 242, 242, 0.5);
    }

    .empty {
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }

    .line {
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-sm);
      padding: var(--space-2);
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .line.error {
      border-color: rgba(231, 76, 60, 0.35);
      color: #c0392b;
      background: rgba(254, 242, 242, 0.5);
    }
  `],
})
export class DevStepDetailComponent {
  @Input() step: DevTimelineStep | null = null;
  @Input() runStatus: string | null = null;
  @Input() stopReason: string | null = null;
  @Input() runError: string | null = null;
  @Output() copyCommand = new EventEmitter<void>();
  @Output() copyFailureSummary = new EventEmitter<void>();

  get hasFailureContext(): boolean {
    return !!this.step?.error || !!this.stopReason || !!this.runError;
  }

  statusLabel(status: DevTimelineStep['status']): string {
    if (status === 'success') return '成功';
    if (status === 'failed') return '失败';
    if (status === 'running') return '进行中';
    return '计划中';
  }
}
