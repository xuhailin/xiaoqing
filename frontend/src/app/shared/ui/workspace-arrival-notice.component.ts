import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-workspace-arrival-notice',
  standalone: true,
  template: `
    @if (text) {
      <div class="arrival-notice">{{ text }}</div>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .arrival-notice {
      padding: 0.7rem 0.85rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--chat-notice-info-border);
      background: var(--chat-notice-info-bg);
      color: var(--color-primary);
      font-size: var(--font-size-sm);
      line-height: 1.5;
      box-shadow: 0 10px 24px rgba(79, 109, 245, 0.08);
    }

    @media (prefers-reduced-motion: no-preference) {
      .arrival-notice {
        animation: arrivalNoticeIn 320ms ease-out;
      }
    }

    @keyframes arrivalNoticeIn {
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
})
export class WorkspaceArrivalNoticeComponent {
  @Input() text: string | null = null;
}
