import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChatInputComponent } from './chat-input.component';
import { ChatMessageListComponent } from './chat-message-list.component';
import { DevChatMessage, DevChatRunState } from '../dev-agent.view-model';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppButtonComponent } from '../../shared/ui/app-button.component';
import { AppIconComponent } from '../../shared/ui/app-icon.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';

@Component({
  selector: 'app-dev-chat-panel',
  standalone: true,
  imports: [
    ChatMessageListComponent,
    ChatInputComponent,
    AppBadgeComponent,
    AppButtonComponent,
    AppIconComponent,
    AppPanelComponent,
  ],
  template: `
    <app-panel variant="workbench" padding="none" class="dev-chat-panel">
      <div class="dev-chat-panel__body">
        <header class="chat-header">
          <div class="header-left">
            <app-button variant="ghost" size="sm" class="back-btn" (click)="back.emit()">
              <app-icon name="arrowLeft" size="0.9rem" />
              <span>返回总览</span>
            </app-button>
            <span class="header-title">{{ title }}</span>
            @if (runState?.mode; as mode) {
              <app-badge tone="neutral" [appearance]="'outline'" class="mode-badge">
                {{ mode === 'agent' ? 'Agent' : 'Orchestrated' }}
              </app-badge>
            }
            @if (runState?.updatedAtLabel) {
              <span class="header-time">{{ runState?.updatedAtLabel }}</span>
            }
            @if (runState && runState.costUsd != null) {
              <span class="header-cost">\${{ formatCost(runState!.costUsd!) }}</span>
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
            @if (canResume) {
              <app-button variant="ghost" size="sm" (click)="resume.emit()">恢复</app-button>
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
      </div>
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

    .dev-chat-panel__body {
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
      gap: 0.625rem;
      padding: var(--workbench-header-padding);
      border-bottom: 1px solid var(--color-border-light);
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      min-width: 0;
    }

    .back-btn {
      flex-shrink: 0;
    }

    .header-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      white-space: nowrap;
    }

    .header-time,
    .header-cost {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .header-cost {
      font-variant-numeric: tabular-nums;
    }

    .mode-badge {
      flex-shrink: 0;
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
        padding: var(--workbench-header-padding-mobile);
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
  @Input() title = 'Dev Chat';
  @Input() taskInput = '';
  @Input() sending = false;
  @Input() canCancel = false;
  @Input() canRerun = false;
  @Input() canResume = false;
  @Input() cancelling = false;

  @Output() taskInputChange = new EventEmitter<string>();
  @Output() submit = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() rerun = new EventEmitter<void>();
  @Output() resume = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  protected statusTone(status: DevChatRunState['status']) {
    if (status === 'running') return 'warning';
    if (status === 'success') return 'success';
    if (status === 'failed') return 'danger';
    return 'neutral';
  }

  protected formatCost(value: number): string {
    return value < 0.01 ? value.toFixed(4) : value.toFixed(2);
  }
}
