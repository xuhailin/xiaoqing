import { NgClass } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-chat-message-bubble',
  standalone: true,
  imports: [NgClass],
  template: `
    <article class="chat-message-bubble" [ngClass]="bubbleClasses()">
      <ng-content />
    </article>
  `,
  styles: [`
    .chat-message-bubble {
      max-width: 85%;
      padding: var(--workbench-message-padding);
      border-radius: var(--workbench-card-radius);
      background: var(--dev-agent-assistant-bg);
      border: 1px solid var(--dev-agent-assistant-border);
      box-shadow: var(--chat-bubble-shadow);
      align-self: flex-start;
    }

    .chat-message-bubble--user {
      align-self: flex-end;
      background: var(--dev-agent-user-bg);
      border-color: var(--dev-agent-user-border);
    }

    .chat-message-bubble--assistant {
      align-self: flex-start;
    }
  `],
})
export class AppChatMessageBubbleComponent {
  @Input() role: 'user' | 'assistant' = 'assistant';

  protected bubbleClasses(): string[] {
    return [`chat-message-bubble--${this.role}`];
  }
}
