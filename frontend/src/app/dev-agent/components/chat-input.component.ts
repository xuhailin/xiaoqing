import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="chat-input">
      <textarea
        [ngModel]="taskInput"
        (ngModelChange)="taskInputChange.emit($event)"
        (keydown.enter)="handleEnter($event)"
        [disabled]="sending"
        placeholder="输入开发任务"
      ></textarea>

      <div class="input-actions">
        <div class="hint">例如：检查 dev-agent executor / 修复 typescript error</div>
        <button
          type="button"
          class="send-btn"
          [disabled]="sending || !taskInput.trim()"
          (click)="submit.emit()"
        >
          {{ sending ? 'Running...' : '发送任务' }}
        </button>
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
      width: 100%;
      min-height: 96px;
      max-height: 220px;
      resize: vertical;
      border: 1px solid rgba(120, 111, 96, 0.18);
      border-radius: 18px;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.94);
      color: var(--color-text);
      font-family: var(--font-family);
      font-size: 0.95rem;
      line-height: 1.7;
      outline: none;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
    }

    textarea:focus {
      border-color: rgba(218, 119, 79, 0.45);
      box-shadow: 0 0 0 3px rgba(218, 119, 79, 0.12);
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

    .send-btn {
      border: none;
      border-radius: 999px;
      background: linear-gradient(135deg, #c45a2d, #da774f);
      color: #fff;
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      padding: 10px 18px;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(196, 90, 45, 0.22);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }

    @media (max-width: 900px) {
      .input-actions {
        align-items: stretch;
        flex-direction: column;
      }

      .send-btn {
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
