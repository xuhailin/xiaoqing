import { Component, Input } from '@angular/core';
import { AssistantMessage } from '../dev-agent.view-model';

@Component({
  selector: 'app-assistant-message',
  standalone: true,
  template: `
    <article class="message assistant">
      <div class="meta">
        <span class="label">Assistant</span>
        @if (message.status) {
          <span class="badge" [class]="message.status">{{ statusLabel(message.status) }}</span>
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
      font-size: 11px;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .bubble {
      padding: 14px 16px;
      border-radius: 20px 20px 20px 6px;
      background: rgba(247, 243, 237, 0.98);
      border: 1px solid rgba(120, 111, 96, 0.08);
      color: var(--color-text);
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: var(--shadow-sm);
    }

    .bubble.progress {
      background: linear-gradient(135deg, rgba(255, 250, 244, 0.98), rgba(247, 240, 233, 0.98));
    }

    .badge {
      border-radius: 999px;
      padding: 2px 8px;
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
export class AssistantMessageComponent {
  @Input({ required: true }) message!: AssistantMessage;

  statusLabel(status: AssistantMessage['status']): string {
    if (status === 'running') return 'Running';
    if (status === 'success') return 'Success';
    if (status === 'failed') return 'Failed';
    return '';
  }
}
