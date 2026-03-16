import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChatInputComponent } from './chat-input.component';
import { ChatMessageListComponent } from './chat-message-list.component';
import { DevChatMessage, DevChatRunState } from '../dev-agent.view-model';

@Component({
  selector: 'app-dev-chat-panel',
  standalone: true,
  imports: [ChatMessageListComponent, ChatInputComponent],
  template: `
    <section class="dev-chat-panel">
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
            <span class="status-badge" [class]="runState.status">{{ runState.statusLabel }}</span>
          }
          @if (canCancel) {
            <button type="button" class="action ghost" [disabled]="cancelling" (click)="cancel.emit()">
              {{ cancelling ? '取消中...' : '停止' }}
            </button>
          }
          @if (canRerun) {
            <button type="button" class="action" (click)="rerun.emit()">重试</button>
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
    </section>
  `,
  styles: [`
    .dev-chat-panel {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(120, 111, 96, 0.12);
      border-radius: 24px;
      overflow: hidden;
      background:
        radial-gradient(circle at top right, rgba(218, 119, 79, 0.08), transparent 20%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(252, 249, 245, 0.98));
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

    .status-badge,
    .action {
      border-radius: 999px;
      padding: 8px 14px;
      font-size: 11px;
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .status-badge.running {
      color: #9a5512;
      background: #fff3d7;
    }

    .status-badge.success {
      color: var(--color-success);
      background: var(--color-success-bg);
    }

    .status-badge.failed {
      color: var(--color-error);
      background: var(--color-error-bg);
    }

    .action {
      border: none;
      cursor: pointer;
      background: linear-gradient(135deg, #c45a2d, #da774f);
      color: #fff;
      font-family: var(--font-family);
    }

    .action.ghost {
      border: 1px solid var(--color-border);
      background: rgba(255, 255, 255, 0.88);
      color: var(--color-text-secondary);
    }

    .action:disabled {
      opacity: 0.55;
      cursor: not-allowed;
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
}
