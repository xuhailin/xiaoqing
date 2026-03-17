import { Component, Input, signal } from '@angular/core';
import { ToolResultMessage } from '../dev-agent.view-model';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';

@Component({
  selector: 'app-tool-result-message',
  standalone: true,
  imports: [AppBadgeComponent],
  template: `
    <article class="tool-result">
      <button type="button" class="result-head" (click)="toggleExpanded()">
        <div>
          <div class="label-row">
            <span class="kind">Result</span>
            <strong>{{ message.tool }}</strong>
          </div>
          <div class="summary">{{ message.summary }}</div>
        </div>
        <div class="head-right">
          <app-badge [tone]="statusTone(message.status)" [caps]="true" size="sm">
            {{ statusLabel(message.status) }}
          </app-badge>
          @if (hasDetail()) {
            <span class="toggle">{{ expanded() ? '收起' : '展开' }}</span>
          }
        </div>
      </button>

      @if (expanded() && hasDetail()) {
        <div class="detail">
          @if (message.meta.length) {
            <div class="meta">
              @for (item of message.meta; track item) {
                <span>{{ item }}</span>
              }
            </div>
          }
          @if (message.error) {
            <pre class="error">{{ message.error }}</pre>
          }
          @if (message.body) {
            <pre>{{ message.body }}</pre>
          }
        </div>
      }
    </article>
  `,
  styles: [`
    .tool-result {
      border: 1px solid var(--color-workbench-border);
      border-radius: var(--workbench-card-radius);
      background: linear-gradient(180deg, rgba(244, 248, 255, 0.95), rgba(255, 255, 255, 0.92));
      overflow: hidden;
    }

    .result-head {
      width: 100%;
      border: none;
      background: transparent;
      padding: 0.625rem 0.875rem;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      text-align: left;
      cursor: pointer;
      font-family: var(--font-family);
    }

    .label-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-sm);
      color: var(--color-text);
    }

    .kind {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
    }

    .summary {
      margin-top: 4px;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
    }

    .head-right {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .toggle {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .detail {
      border-top: 1px solid var(--color-border-light);
      padding: 0.75rem 0.875rem 0.875rem;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .meta span {
      font-size: 11px;
      color: var(--color-text-secondary);
      background: rgba(244, 248, 255, 0.92);
      border-radius: 999px;
      padding: 4px 8px;
      border: 1px solid var(--color-border-light);
    }

    pre {
      margin: 0;
      padding: 0.75rem 0.875rem;
      border-radius: 12px;
      background: rgba(246, 249, 255, 0.94);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--color-workbench-muted);
    }

    .error {
      color: var(--color-error);
      background: var(--color-error-bg);
    }
  `],
})
export class ToolResultMessageComponent {
  @Input({ required: true }) message!: ToolResultMessage;

  readonly expanded = signal(false);

  hasDetail(): boolean {
    return !!this.message.body || !!this.message.error || this.message.meta.length > 0;
  }

  toggleExpanded() {
    if (!this.hasDetail()) {
      return;
    }
    this.expanded.update((value) => !value);
  }

  statusLabel(status: ToolResultMessage['status']): string {
    if (status === 'running') return 'Running';
    if (status === 'success') return 'Success';
    return 'Failed';
  }

  statusTone(status: ToolResultMessage['status']) {
    if (status === 'running') return 'warning';
    if (status === 'success') return 'success';
    return 'danger';
  }
}
