import { Component, inject, signal } from '@angular/core';
import { ActionDispatcherService } from '../core/actions/action-dispatcher.service';
import { AppIconComponent } from '../shared/ui/app-icon.component';

@Component({
  selector: 'app-chat-quick-actions',
  standalone: true,
  imports: [
    AppIconComponent,
  ],
  template: `
    <div class="quick-actions">
      <div class="quick-actions__header">
        <div class="quick-actions__copy">
          <div class="quick-actions__title">快捷入口</div>
          <div class="quick-actions__description">提醒、计划、记忆和执行任务都从这里进入。</div>
        </div>
      </div>

      <div class="quick-actions__grid">
        @for (action of actions; track action.id) {
          <button
            type="button"
            class="quick-actions__item ui-list-card"
            [title]="action.description"
            [disabled]="!action.enabled"
            (click)="dispatch(action.id)"
          >
            <span class="quick-actions__item-main">
              <span class="quick-actions__icon">
                <app-icon [name]="action.icon" size="0.95rem" />
              </span>
              <span class="quick-actions__label">{{ action.label }}</span>
            </span>
          </button>
        }
      </div>

      @if (notice()) {
        <div class="quick-actions__notice">{{ notice() }}</div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: var(--space-2) 0 var(--space-3);
      border-bottom: 1px solid var(--color-border-light);
      margin-bottom: var(--space-3);
    }

    .quick-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .quick-actions__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .quick-actions__copy {
      min-width: 0;
    }

    .quick-actions__title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .quick-actions__description {
      margin-top: var(--space-1);
      font-size: var(--font-size-xs);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .quick-actions__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
    }

    .quick-actions__item {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-height: 40px;
      padding: var(--space-2) var(--space-3);
      text-align: left;
      cursor: pointer;
    }

    .quick-actions__item-main {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }

    .quick-actions__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      color: var(--color-text-secondary);
    }

    .quick-actions__label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    .quick-actions__notice {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }

    @media (max-width: 980px) {
      .quick-actions__grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class ChatQuickActionsComponent {
  private readonly dispatcher = inject(ActionDispatcherService);
  protected readonly actions = this.dispatcher.listQuickActions();
  protected readonly notice = signal<string | null>(null);

  protected dispatch(actionId: Parameters<ActionDispatcherService['dispatch']>[0]) {
    const result = this.dispatcher.dispatch(actionId);
    this.notice.set(result.message);
  }
}
