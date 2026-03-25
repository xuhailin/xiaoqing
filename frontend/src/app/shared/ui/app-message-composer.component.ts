import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppButtonComponent } from './app-button.component';

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [FormsModule, AppButtonComponent],
  template: `
    <section class="message-composer">
      <ng-content select="[composerTop]"></ng-content>

      <div class="composer-main">
        <ng-content select="[composerPrefix]"></ng-content>
        <textarea
          class="ui-textarea"
          [ngModel]="taskInput"
          (ngModelChange)="taskInputChange.emit($event)"
          (keydown.enter)="handleEnter($event)"
          [disabled]="sending"
          [placeholder]="placeholder"
        ></textarea>
        <ng-content select="[composerSuffix]"></ng-content>
      </div>

      <div class="composer-actions">
        <div class="hint">{{ hint }}</div>
        <app-button
          variant="primary"
          [disabled]="sending || submitDisabled || !taskInput.trim()"
          (click)="submit.emit()"
        >
          {{ sending ? sendingLabel : submitLabel }}
        </app-button>
      </div>
    </section>
  `,
  styles: [`
    .message-composer {
      border-top: 1px solid var(--color-border-light);
      background: var(--workbench-surface-gradient-soft);
      padding: var(--workbench-panel-padding);
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
    }

    textarea {
      min-height: var(--workbench-input-min-height);
      max-height: 200px;
      font-size: var(--font-size-md);
      line-height: 1.7;
    }

    .composer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .composer-main {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
    }

    .composer-main textarea {
      flex: 1;
      min-width: 0;
    }

    .hint {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }

    @media (max-width: 900px) {
      .message-composer {
        padding: var(--space-3);
      }

      .composer-actions {
        align-items: stretch;
        flex-direction: column;
      }

      app-button {
        width: 100%;
      }
    }
  `],
})
export class AppMessageComposerComponent {
  @Input() taskInput = '';
  @Input() sending = false;
  @Input() placeholder = '输入内容';
  @Input() hint = '';
  @Input() submitLabel = '发送';
  @Input() sendingLabel = 'Running...';
  @Input() submitDisabled = false;

  @Output() taskInputChange = new EventEmitter<string>();
  @Output() submit = new EventEmitter<void>();

  handleEnter(event: Event) {
    const keyboard = event as KeyboardEvent;
    if (keyboard.isComposing || (keyboard as { keyCode?: number }).keyCode === 229) return;
    if (keyboard.shiftKey) return;
    keyboard.preventDefault();
    this.submit.emit();
  }
}
