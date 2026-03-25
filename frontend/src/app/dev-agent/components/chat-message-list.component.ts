import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import {
  AssistantMessage,
  DevChatMessage,
  ToolCallMessage,
  ToolResultMessage,
  UserMessage,
} from '../dev-agent.view-model';
import { UserMessageComponent } from './user-message.component';
import { AssistantMessageComponent } from './assistant-message.component';
import { RunExecutionBlockComponent } from './run-execution-block.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

interface RunGroup {
  id: string;
  userMessage: UserMessage | null;
  progressMessage: AssistantMessage | null;
  steps: (ToolCallMessage | ToolResultMessage)[];
  summaryMessage: AssistantMessage | null;
}

function groupRunMessages(messages: DevChatMessage[]): RunGroup[] {
  const groups: RunGroup[] = [];
  let current: RunGroup | null = null;

  for (const msg of messages) {
    if (msg.kind === 'user') {
      if (current) groups.push(current);
      current = { id: msg.id, userMessage: msg, progressMessage: null, steps: [], summaryMessage: null };
    } else if (msg.kind === 'assistant' && msg.tone === 'progress') {
      if (!current) current = { id: msg.id, userMessage: null, progressMessage: null, steps: [], summaryMessage: null };
      current.progressMessage = msg;
    } else if (msg.kind === 'tool-call' || msg.kind === 'tool-result') {
      if (!current) current = { id: msg.id, userMessage: null, progressMessage: null, steps: [], summaryMessage: null };
      current.steps.push(msg);
    } else if (msg.kind === 'assistant' && msg.tone === 'summary') {
      if (!current) current = { id: msg.id, userMessage: null, progressMessage: null, steps: [], summaryMessage: null };
      current.summaryMessage = msg;
    }
  }
  if (current) groups.push(current);
  return groups;
}

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [
    UserMessageComponent,
    AssistantMessageComponent,
    RunExecutionBlockComponent,
    AppStateComponent,
  ],
  template: `
    <section class="message-list ui-scrollbar" #scrollContainer>
      @if (!messages.length) {
        <app-state
          title="新的开发 Session"
          description="在下方输入你的开发任务，小晴会实时显示执行进度并在完成后给出回复。"
        />
      } @else {
        @for (group of runGroups; track group.id) {
          @if (group.userMessage) {
            <app-user-message [message]="group.userMessage" />
          }
          @if (group.progressMessage || group.steps.length) {
            <app-run-execution-block
              [progressMessage]="group.progressMessage"
              [steps]="group.steps"
              [isRunning]="isGroupRunning(group)"
            />
          }
          @if (group.summaryMessage) {
            <app-assistant-message
              [message]="group.summaryMessage"
              [canRetry]="group.summaryMessage.id === retryMessageId"
              (retryClick)="retry.emit()"
            />
          }
        }
      }
    </section>
  `,
  styles: [`
    :host {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
    }

    .message-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: var(--workbench-chat-padding);
      display: flex;
      flex-direction: column;
      gap: var(--workbench-chat-gap);
    }
  `],
})
export class ChatMessageListComponent implements AfterViewChecked {
  @Input() messages: DevChatMessage[] = [];
  @Input() canRetry = false;
  @Output() retry = new EventEmitter<void>();
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLElement>;

  protected get runGroups(): RunGroup[] {
    return groupRunMessages(this.messages);
  }

  protected isGroupRunning(group: RunGroup): boolean {
    if (group.progressMessage?.status === 'running') return true;
    return group.steps.at(-1)?.status === 'running';
  }

  get retryMessageId(): string | null {
    if (!this.canRetry || !this.messages.length) return null;
    const last = this.messages[this.messages.length - 1];
    if (last.kind !== 'assistant' || last.tone !== 'summary' || last.status !== 'failed') return null;
    return last.id;
  }

  private lastMessagesSignature = '';

  ngAfterViewChecked() {
    const currentSignature = this.messageSignature();
    if (currentSignature !== this.lastMessagesSignature) {
      this.lastMessagesSignature = currentSignature;
      this.scrollToBottom();
    }
  }

  private messageSignature(): string {
    if (!this.messages.length) {
      return 'empty';
    }
    const last = this.messages[this.messages.length - 1];
    const content = 'text' in last
      ? last.text
      : 'summary' in last
        ? last.summary
        : '';
    return `${this.messages.length}:${last.id}:${last.status ?? 'none'}:${content}`;
  }

  private scrollToBottom() {
    const el = this.scrollContainer?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
