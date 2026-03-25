import { Component, Input, signal } from '@angular/core';
import { ToolResultMessage } from '../dev-agent.view-model';

@Component({
  selector: 'app-tool-result-message',
  standalone: true,
  imports: [],
  template: `
    <article class="step-row" [class.failed]="message.status === 'failed'">
      <button type="button" class="head" (click)="toggleExpanded()">
        <span class="kind">Result</span>
        <strong class="tool-name">{{ message.tool }}</strong>
        <span class="summary">{{ message.summary }}</span>
        @if (message.status === 'failed') {
          <span class="status-failed">FAILED</span>
        }
        @if (hasDetail()) {
          <span class="toggle">{{ expanded() ? '收起' : '展开' }}</span>
        }
      </button>

      @if (expanded() && hasDetail()) {
        <div class="detail">
          @if (message.command) {
            <code class="command">{{ message.command }}</code>
          }
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
    .step-row {
      border-left: 2px solid var(--color-border-light);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      background: transparent;
      overflow: hidden;
    }

    .step-row.failed {
      border-left-color: var(--color-error-border);
    }

    .head {
      width: 100%;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 5px var(--space-3);
      border: none;
      background: transparent;
      cursor: pointer;
      text-align: left;
      font-family: var(--font-family);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      overflow: hidden;
    }

    .kind {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      flex-shrink: 0;
      opacity: 0.7;
    }

    .tool-name {
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      flex-shrink: 0;
    }

    .summary {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .status-failed {
      font-size: 10px;
      font-weight: var(--font-weight-medium);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-error);
      flex-shrink: 0;
    }

    .toggle {
      font-size: 10px;
      color: var(--color-text-muted);
      flex-shrink: 0;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .detail {
      padding: var(--space-2) var(--space-3) var(--space-3);
      border-top: 1px solid var(--color-border-light);
      background: var(--color-surface-muted);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .command {
      display: block;
      white-space: pre-wrap;
      word-break: break-all;
      font-size: var(--font-size-xs);
      color: var(--color-workbench-muted);
      background: var(--dev-agent-tool-code-bg);
      border-radius: var(--radius-sm);
      padding: var(--space-2) var(--space-3);
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .meta span {
      font-size: var(--font-size-xxs);
      color: var(--color-text-secondary);
      background: var(--color-surface-muted);
      border-radius: var(--radius-pill);
      padding: 3px var(--space-2);
      border: 1px solid var(--color-border-light);
    }

    pre {
      margin: 0;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-surface-muted);
      border: 1px solid var(--color-workbench-border);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: var(--font-size-xxs);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--color-workbench-muted);
    }

    .error {
      color: var(--color-error);
      background: var(--color-error-bg);
      border-color: var(--color-error-border);
    }
  `],
})
export class ToolResultMessageComponent {
  @Input({ required: true }) message!: ToolResultMessage;

  readonly expanded = signal(false);

  hasDetail(): boolean {
    return !!this.message.command || !!this.message.body || !!this.message.error || this.message.meta.length > 0;
  }

  toggleExpanded() {
    if (!this.hasDetail()) {
      return;
    }
    this.expanded.update((value) => !value);
  }

}
