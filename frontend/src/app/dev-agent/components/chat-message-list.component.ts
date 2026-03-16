import { AfterViewChecked, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { DevChatMessage } from '../dev-agent.view-model';
import { UserMessageComponent } from './user-message.component';
import { AssistantMessageComponent } from './assistant-message.component';
import { ToolCallMessageComponent } from './tool-call-message.component';
import { ToolResultMessageComponent } from './tool-result-message.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [
    UserMessageComponent,
    AssistantMessageComponent,
    ToolCallMessageComponent,
    ToolResultMessageComponent,
    AppStateComponent,
  ],
  template: `
    <section class="message-list ui-scrollbar" #scrollContainer>
      @if (!messages.length) {
        <app-state
          title="AI 开发助手"
          description="直接描述你的开发任务，右侧会按 User → Assistant → Tool → Result 的顺序展开执行过程。"
        />
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
