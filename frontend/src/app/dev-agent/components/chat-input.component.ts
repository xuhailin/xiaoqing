import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppButtonComponent } from '../../shared/ui/app-button.component';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [FormsModule, AppButtonComponent],
  template: `
    <section class="chat-input">
      <textarea
        class="ui-textarea"
        [ngModel]="taskInput"
        (ngModelChange)="taskInputChange.emit($event)"
        (keydown.enter)="handleEnter($event)"
        [disabled]="sending"
        [placeholder]="placeholder"
      ></textarea>

      <div class="input-actions">
        <div class="hint">{{ hint }}</div>
        <app-button
          variant="primary"
          [disabled]="sending || !taskInput.trim()"
          (click)="submit.emit()"
        >
          {{ sending ? 'Running...' : submitLabel }}
        </app-button>
      </div>
    </section>
  `,
  styles: [`
    .chat-input {
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

    .input-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .hint {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }

    @media (max-width: 900px) {
      .chat-input {
        padding: var(--space-3);
      }

      .input-actions {
        align-items: stretch;
        flex-direction: column;
      }

      app-button {
        width: 100%;
      }
    }
  `],
})
export class ChatInputComponent {
  @Input() taskInput = '';
  @Input() sending = false;
  @Input() placeholder = '输入开发任务';
  @Input() hint = '例如：检查 dev-agent executor / 修复 typescript error';
  @Input() submitLabel = '发送任务';

  @Output() taskInputChange = new EventEmitter<string>();
  @Output() submit = new EventEmitter<void>();

  handleEnter(event: Event) {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey) return;
    keyboard.preventDefault();
    this.submit.emit();
  }
}
