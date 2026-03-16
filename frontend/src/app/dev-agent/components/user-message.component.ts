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
      max-width: min(72ch, 82%);
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      margin-left: auto;
    }

    .label {
      font-size: 11px;
      color: #b15b34;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .bubble {
      padding: 14px 16px;
      border-radius: 20px 20px 6px 20px;
      background: linear-gradient(135deg, #fff0e8, #ffe1cf);
      color: var(--color-text);
      box-shadow: var(--shadow-sm);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.7;
    }
  `],
})
export class UserMessageComponent {
  @Input({ required: true }) message!: UserMessage;
}
