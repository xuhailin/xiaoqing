import { Component, Input } from '@angular/core';
import { ToolCallMessage } from '../dev-agent.view-model';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';

@Component({
  selector: 'app-tool-call-message',
  standalone: true,
  imports: [AppBadgeComponent],
  template: `
    <article class="tool-card">
      <div class="tool-head">
        <div class="label-row">
          <span class="kind">Tool</span>
          <strong>{{ message.tool }}</strong>
        </div>
        <app-badge [tone]="statusTone(message.status)" [caps]="true" size="sm">
          {{ statusLabel(message.status) }}
        </app-badge>
      </div>
      <code>{{ message.command }}</code>
      <div class="summary">{{ message.summary }}</div>
    </article>
  `,
  styles: [`
    .tool-card {
      border: 1px solid var(--color-workbench-border);
      border-radius: var(--workbench-card-radius);
      background: linear-gradient(180deg, rgba(246, 249, 255, 0.95), rgba(255, 255, 255, 0.9));
      padding: 0.625rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
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
      font-size: var(--font-size-xs);
      color: var(--color-workbench-muted);
      background: rgba(79, 109, 245, 0.06);
      border-radius: var(--radius-md);
      padding: 0.5rem 0.75rem;
    }

    .summary {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
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

  statusTone(status: ToolCallMessage['status']) {
    if (status === 'running') return 'warning';
    if (status === 'success') return 'success';
    return 'danger';
  }
}
