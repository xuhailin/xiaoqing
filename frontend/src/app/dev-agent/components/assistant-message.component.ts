import { Component, Input } from '@angular/core';
import { AssistantMessage } from '../dev-agent.view-model';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';

@Component({
  selector: 'app-assistant-message',
  standalone: true,
  imports: [AppBadgeComponent],
  template: `
    <article class="message assistant">
      <div class="meta">
        <span class="label">Assistant</span>
        @if (message.status) {
          <app-badge [tone]="statusTone(message.status)" [caps]="true" size="sm">
            {{ statusLabel(message.status) }}
          </app-badge>
        }
      </div>
      <div class="bubble" [class.progress]="message.tone === 'progress'">{{ message.text }}</div>
    </article>
  `,
  styles: [`
    .message {
      max-width: min(76ch, 86%);
      display: flex;
      flex-direction: column;
      gap: 6px;
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

    .bubble {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-lg);
      background: var(--color-assistant-bubble);
      border: 1px solid var(--color-border-light);
      color: var(--color-text);
      font-size: var(--font-size-sm);
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: var(--shadow-sm);
    }

    .bubble.progress {
      background: linear-gradient(180deg, #ffffff, #f8fafc);
    }
  `],
})
export class AssistantMessageComponent {
  @Input({ required: true }) message!: AssistantMessage;

  statusLabel(status: AssistantMessage['status']): string {
    if (status === 'running') return 'Running';
    if (status === 'success') return 'Success';
    if (status === 'failed') return 'Failed';
    return '';
  }

  statusTone(status: AssistantMessage['status']) {
    if (status === 'running') return 'warning';
    if (status === 'success') return 'success';
    if (status === 'failed') return 'danger';
    return 'neutral';
  }
}
