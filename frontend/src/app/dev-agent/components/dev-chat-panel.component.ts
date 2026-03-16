import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChatInputComponent } from './chat-input.component';
import { ChatMessageListComponent } from './chat-message-list.component';
import { DevChatMessage, DevChatRunState } from '../dev-agent.view-model';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppButtonComponent } from '../../shared/ui/app-button.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';

@Component({
  selector: 'app-dev-chat-panel',
  standalone: true,
  imports: [
    ChatMessageListComponent,
    ChatInputComponent,
    AppBadgeComponent,
    AppButtonComponent,
    AppPanelComponent,
  ],
  template: `
    <app-panel variant="workbench" padding="none" class="dev-chat-panel">
      <header class="chat-header">
        <div class="header-left">
          <span class="header-title">Dev Chat</span>
          @if (runState?.workspaceLabel) {
            <span class="header-workspace">{{ runState?.workspaceLabel }}</span>
          }
          @if (runState?.updatedAtLabel) {
            <span class="header-time">{{ runState?.updatedAtLabel }}</span>
          }
        </div>

        <div class="header-actions">
          @if (runState) {
            <app-badge
              class="status-badge"
              [tone]="statusTone(runState.status)"
              [caps]="true"
            >
              {{ runState.statusLabel }}
            </app-badge>
          }
          @if (canCancel) {
            <app-button variant="ghost" size="sm" [disabled]="cancelling" (click)="cancel.emit()">
              {{ cancelling ? '取消中...' : '停止' }}
            </app-button>
          }
          @if (canRerun) {
            <app-button variant="primary" size="sm" (click)="rerun.emit()">重试</app-button>
          }
        </div>
      </header>

      <app-chat-message-list [messages]="messages" />

      <app-chat-input
        [taskInput]="taskInput"
        [sending]="sending"
        (taskInputChange)="taskInputChange.emit($event)"
        (submit)="submit.emit()"
      />
    </app-panel>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .dev-chat-panel {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border-light);
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
    }

    .header-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      white-space: nowrap;
    }

    .header-workspace {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-time {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    @media (max-width: 900px) {
      .chat-header {
        flex-wrap: wrap;
      }

      .header-left {
        flex-wrap: wrap;
      }
    }
  `],
})
export class DevChatPanelComponent {
  @Input() messages: DevChatMessage[] = [];
  @Input() runState: DevChatRunState | null = null;
  @Input() taskInput = '';
  @Input() sending = false;
  @Input() canCancel = false;
  @Input() canRerun = false;
  @Input() cancelling = false;

  @Output() taskInputChange = new EventEmitter<string>();
  @Output() submit = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() rerun = new EventEmitter<void>();

  protected statusTone(status: DevChatRunState['status']) {
    if (status === 'running') return 'warning';
    if (status === 'success') return 'success';
    if (status === 'failed') return 'danger';
    return 'neutral';
  }
}
