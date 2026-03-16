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
        placeholder="输入开发任务"
      ></textarea>

      <div class="input-actions">
        <div class="hint">例如：检查 dev-agent executor / 修复 typescript error</div>
        <app-button
          variant="primary"
          [disabled]="sending || !taskInput.trim()"
          (click)="submit.emit()"
        >
          {{ sending ? 'Running...' : '发送任务' }}
        </app-button>
      </div>
    </section>
  `,
  styles: [`
    .chat-input {
      border-top: 1px solid var(--color-border-light);
      background:
        linear-gradient(180deg, rgba(255, 250, 244, 0.82), rgba(255, 255, 255, 0.98));
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    textarea {
      min-height: 96px;
      max-height: 220px;
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

  @Output() taskInputChange = new EventEmitter<string>();
  @Output() submit = new EventEmitter<void>();

  handleEnter(event: Event) {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey) return;
    keyboard.preventDefault();
    this.submit.emit();
  }
}
