import { Component, Input, inject, signal } from '@angular/core';
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
      @if (mode === 'sidebar') {
        <div class="quick-actions__header">
          <div class="quick-actions__copy">
            <div class="quick-actions__title">对话空间</div>
            <div class="quick-actions__description">最近的会话和常用入口都集中在这里。</div>
          </div>
        </div>
      }

      <div class="quick-actions__grid" [class.quick-actions__grid--composer]="mode === 'composer'">
        @for (action of actions; track action.id) {
          <button
            type="button"
            class="quick-actions__item ui-list-card"
            [class.quick-actions__item--composer]="mode === 'composer'"
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
      padding: 0;
    }

    .quick-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    :host-context(.chat-composer-actions) .quick-actions {
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
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      line-height: 1.2;
    }

    .quick-actions__description {
      margin-top: var(--space-1);
      font-size: var(--font-size-xs);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .quick-actions__grid {
      display: flex;
      gap: var(--space-2);
      overflow-x: auto;
      padding-bottom: var(--space-1);
    }

    .quick-actions__grid--composer {
      padding-bottom: 0;
    }

    .quick-actions__item {
      width: auto;
      min-width: fit-content;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-height: 38px;
      padding: 0 var(--space-3);
      text-align: left;
      cursor: pointer;
      border-radius: var(--radius-md);
      border: 1px solid var(--chat-quick-action-border);
      background: transparent;
      box-shadow: none;
    }

    .quick-actions__item--composer {
      min-height: 34px;
      padding: 0 var(--space-2);
      border-radius: var(--radius-sm);
      background: var(--chat-quick-action-composer-bg);
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
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        overflow-x: visible;
      }

      .quick-actions__item {
        width: 100%;
        min-width: 0;
      }
    }
  `],
})
export class ChatQuickActionsComponent {
  @Input() mode: 'sidebar' | 'composer' = 'sidebar';

  private readonly dispatcher = inject(ActionDispatcherService);
  protected readonly actions = this.dispatcher.listQuickActions();
  protected readonly notice = signal<string | null>(null);

  protected dispatch(actionId: Parameters<ActionDispatcherService['dispatch']>[0]) {
    const result = this.dispatcher.dispatch(actionId);
    this.notice.set(result.message);
  }
}
