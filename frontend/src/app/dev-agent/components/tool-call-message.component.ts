import { Component, Input } from '@angular/core';
import { ToolCallMessage } from '../dev-agent.view-model';

@Component({
  selector: 'app-tool-call-message',
  standalone: true,
  template: `
    <article class="tool-card">
      <div class="tool-head">
        <div class="label-row">
          <span class="kind">Tool</span>
          <strong>{{ message.tool }}</strong>
        </div>
        <span class="badge" [class]="message.status">{{ statusLabel(message.status) }}</span>
      </div>
      <code>{{ message.command }}</code>
      <div class="summary">{{ message.summary }}</div>
    </article>
  `,
  styles: [`
    .tool-card {
      border: 1px solid rgba(120, 111, 96, 0.12);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.9);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .tool-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .label-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--color-text);
      font-size: var(--font-size-sm);
    }

    .kind {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
    }

    code {
      white-space: pre-wrap;
      word-break: break-all;
      font-size: 12px;
      color: #4d4337;
      background: rgba(44, 40, 32, 0.04);
      border-radius: 12px;
      padding: 10px 12px;
    }

    .summary {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
    }

    .badge {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 10px;
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .badge.running {
      color: #9a5512;
      background: #fff3d7;
    }

    .badge.success {
      color: var(--color-success);
      background: var(--color-success-bg);
    }

    .badge.failed {
      color: var(--color-error);
      background: var(--color-error-bg);
    }
  `],
})
export class ToolCallMessageComponent {
  @Input({ required: true }) message!: ToolCallMessage;

  statusLabel(status: ToolCallMessage['status']): string {
    if (status === 'running') return 'Running';
    if (status === 'success') return 'Success';
    return 'Failed';
  }
}
