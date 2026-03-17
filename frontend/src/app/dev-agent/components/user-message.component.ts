import { Component, Input } from '@angular/core';
import { UserMessage } from '../dev-agent.view-model';

@Component({
  selector: 'app-user-message',
  standalone: true,
  template: `
    <article class="message user">
      <div class="label">User</div>
      <div class="bubble">{{ message.text }}</div>
    </article>
  `,
  styles: [`
    .message {
      max-width: min(var(--workbench-message-measure), var(--workbench-message-max-width));
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.35rem;
      margin-left: auto;
    }

    .label {
      font-size: var(--font-size-xs);
      color: var(--color-user-label);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .bubble {
      padding: var(--workbench-message-padding);
      border-radius: var(--workbench-card-radius);
      background: var(--color-user-bubble);
      border: 1px solid rgba(79, 109, 245, 0.12);
      color: var(--color-text);
      font-size: var(--font-size-sm);
      box-shadow: var(--shadow-sm);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.55;
    }
  `],
})
export class UserMessageComponent {
  @Input({ required: true }) message!: UserMessage;
}
