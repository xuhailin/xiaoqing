import { Component, Input } from '@angular/core';
import { ToolCallMessage } from '../dev-agent.view-model';

@Component({
  selector: 'app-tool-call-message',
  standalone: true,
  imports: [],
  template: `
    <article class="step-row" [class.running]="message.status === 'running'">
      <span class="kind">Tool</span>
      <strong class="tool-name">{{ message.tool }}</strong>
      <span class="summary">{{ message.summary }}</span>
      @if (message.status === 'running') {
        <span class="spinner" aria-hidden="true"></span>
      }
    </article>
  `,
  styles: [`
    .step-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 5px var(--space-3);
      border-left: 2px solid var(--color-workbench-border);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      background: transparent;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      overflow: hidden;
    }

    .step-row.running {
      border-left-color: var(--color-primary);
      animation: border-pulse 1.4s ease-in-out infinite;
    }

    @keyframes border-pulse {
      0%, 100% { border-left-color: var(--color-primary); }
      50% { border-left-color: color-mix(in srgb, var(--color-primary) 28%, transparent); }
    }

    .kind {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
      flex-shrink: 0;
      opacity: 0.7;
    }

    .tool-name {
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      flex-shrink: 0;
    }

    .summary {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--color-text-muted);
    }

    .spinner {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: var(--radius-pill);
      border: 1.5px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
      border-top-color: var(--color-primary);
      animation: spin 0.9s linear infinite;
      flex-shrink: 0;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class ToolCallMessageComponent {
  @Input({ required: true }) message!: ToolCallMessage;

}
