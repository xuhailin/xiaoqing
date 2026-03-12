import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dev-composer',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="composer">
      <div class="composer-main">
        <textarea
          [ngModel]="taskInput"
          (ngModelChange)="taskInputChange.emit($event)"
          (keydown.enter)="handleEnter($event)"
          [disabled]="sending"
          placeholder="输入开发任务（例如：检查 backend/src/dev-agent 下有哪些 executor，并输出文件列表）"
        ></textarea>
        <button
          type="button"
          class="run-btn"
          [disabled]="sending || !taskInput.trim()"
          (click)="submit.emit()"
        >
          {{ sending ? '执行中...' : '执行任务' }}
        </button>
      </div>

      <div class="composer-meta">
        <input
          type="text"
          [ngModel]="workspaceRoot"
          (ngModelChange)="workspaceRootChange.emit($event)"
          [disabled]="sending"
          placeholder="可选：workspace 路径（例如 /Users/.../backend）"
        />
      </div>
    </section>
  `,
  styles: [`
    .composer {
      border-top: 1px solid var(--color-border);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), #fff);
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .composer-main {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-2);
      align-items: end;
    }

    textarea {
      width: 100%;
      min-height: 72px;
      max-height: 180px;
      resize: vertical;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface);
      color: var(--color-text);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      line-height: var(--line-height-base);
      outline: none;
    }

    textarea:focus {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(92, 103, 242, 0.16);
    }

    .run-btn {
      border: none;
      border-radius: var(--radius-md);
      background: var(--color-primary);
      color: #fff;
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      padding: var(--space-2) var(--space-4);
      cursor: pointer;
      height: 40px;
    }

    .run-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .composer-meta input {
      width: 100%;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font-family: var(--font-family);
      font-size: var(--font-size-xs);
      outline: none;
    }

    .composer-meta input:focus {
      border-color: var(--color-primary);
    }

    @media (max-width: 1024px) {
      .composer-main {
        grid-template-columns: 1fr;
      }

      .run-btn {
        width: 100%;
      }
    }
  `],
})
export class DevComposerComponent {
  @Input() taskInput = '';
  @Input() workspaceRoot = '';
  @Input() sending = false;

  @Output() taskInputChange = new EventEmitter<string>();
  @Output() workspaceRootChange = new EventEmitter<string>();
  @Output() submit = new EventEmitter<void>();

  handleEnter(event: Event) {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey) return;
    keyboard.preventDefault();
    this.submit.emit();
  }
}
