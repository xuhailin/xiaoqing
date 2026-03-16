import { AfterViewChecked, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { DevChatMessage } from '../dev-agent.view-model';
import { UserMessageComponent } from './user-message.component';
import { AssistantMessageComponent } from './assistant-message.component';
import { ToolCallMessageComponent } from './tool-call-message.component';
import { ToolResultMessageComponent } from './tool-result-message.component';

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [
    UserMessageComponent,
    AssistantMessageComponent,
    ToolCallMessageComponent,
    ToolResultMessageComponent,
  ],
  template: `
    <section class="message-list" #scrollContainer>
      @if (!messages.length) {
        <div class="empty-state">
          <div class="title">AI 开发助手</div>
          <p>直接描述你的开发任务，右侧会按 User → Assistant → Tool → Result 的顺序展开执行过程。</p>
        </div>
      } @else {
        @for (message of messages; track message.id) {
          @switch (message.kind) {
            @case ('user') {
              <app-user-message [message]="message" />
            }
            @case ('assistant') {
              <app-assistant-message [message]="message" />
            }
            @case ('tool-call') {
              <app-tool-call-message [message]="message" />
            }
            @case ('tool-result') {
              <app-tool-result-message [message]="message" />
            }
          }
        }
      }
    </section>
  `,
  styles: [`
    .message-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      scrollbar-width: thin;
      scrollbar-color: var(--color-border) transparent;
    }

    .empty-state {
      margin: auto 0;
      max-width: 40rem;
      padding: 32px;
      border-radius: 24px;
      background: linear-gradient(135deg, rgba(255, 250, 244, 0.98), rgba(247, 242, 235, 0.98));
      border: 1px solid rgba(120, 111, 96, 0.1);
      box-shadow: var(--shadow-md);
    }

    .empty-state .title {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--space-2);
    }

    .empty-state p {
      margin: 0;
      color: var(--color-text-secondary);
      line-height: 1.8;
    }
  `],
})
export class ChatMessageListComponent implements AfterViewChecked {
  @Input() messages: DevChatMessage[] = [];
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLElement>;

  private lastMessageCount = 0;

  ngAfterViewChecked() {
    if (this.messages.length !== this.lastMessageCount) {
      this.lastMessageCount = this.messages.length;
      this.scrollToBottom();
    }
  }

  private scrollToBottom() {
    const el = this.scrollContainer?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
