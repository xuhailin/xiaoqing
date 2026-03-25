import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * 浮动通知条（toast），用于短暂操作反馈。
 * 由父层控制 message 信号的生命周期（通常 2~3s 后置 null）。
 *
 * 用法：
 *   <app-status-notice [message]="store.actionNotice()" />
 */
@Component({
  selector: 'app-status-notice',
  standalone: true,
  template: `
    @if (message) {
      <div class="status-notice" role="status" aria-live="polite">
        {{ message }}
      </div>
    }
  `,
  styles: [`
    :host {
      position: absolute;
      right: var(--space-4);
      top: var(--space-4);
      z-index: 10;
      pointer-events: none;
    }

    .status-notice {
      font-size: var(--font-size-xs);
      color: var(--dev-agent-notice-text);
      border: 1px solid var(--dev-agent-notice-border);
      background: var(--dev-agent-notice-bg);
      border-radius: var(--radius-md);
      padding: 0.5rem 0.75rem;
      box-shadow: var(--chat-panel-shadow);
      max-width: min(340px, 72vw);
      backdrop-filter: blur(12px);
      animation: notice-in 0.15s ease-out;
    }

    @keyframes notice-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppStatusNoticeComponent {
  @Input() message: string | null = null;
}
