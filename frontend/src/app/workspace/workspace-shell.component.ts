import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-workspace-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="workspace-shell">
      <aside class="workspace-sidebar">
        <div class="workspace-sidebar__label">工作台</div>
        <nav class="workspace-nav">
          @for (item of workspaceItems; track item.value) {
            <button
              type="button"
              class="workspace-nav__item"
              [class.is-active]="currentSection() === item.value"
              (click)="openSection(item.value)"
            >
              {{ item.label }}
            </button>
          }
        </nav>
      </aside>

      <div class="workspace-stage">
        <router-outlet />
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .workspace-shell {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: 176px minmax(0, 1fr);
      gap: var(--workbench-section-gap);
      padding: var(--workbench-shell-padding) calc(var(--workbench-shell-padding) + var(--space-2));
    }

    .workspace-sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
      padding-top: var(--space-1);
    }

    .workspace-sidebar__label {
      font-size: var(--font-size-xxs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .workspace-nav {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .workspace-nav__item {
      width: 100%;
      min-height: 32px;
      padding: 0 var(--space-2);
      border: none;
      border-left: 2px solid transparent;
      background: transparent;
      color: var(--color-text-secondary);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      text-align: left;
      cursor: pointer;
      transition:
        border-color var(--transition-fast),
        color var(--transition-fast);
    }

    .workspace-nav__item:hover:not(.is-active) {
      color: var(--color-text);
    }

    .workspace-nav__item.is-active {
      border-color: var(--color-primary);
      color: var(--color-text);
    }

    .workspace-stage {
      min-height: 0;
      min-width: 0;
      overflow: auto;
    }

    @media (max-width: 980px) {
      .workspace-shell {
        grid-template-columns: 1fr;
        padding: var(--workbench-shell-padding-mobile);
      }
    }
  `],
})
export class WorkspaceShellComponent {
  protected readonly workspaceItems = [
    { value: 'dev-agent', label: 'DevAgent' },
    { value: 'reminder', label: 'Reminder' },
    { value: 'plan', label: 'Todo / Plan' },
    { value: 'regression', label: '回归测试' },
    { value: 'task-records', label: '任务记录' },
  ] as const;

  constructor(private readonly router: Router) {}

  currentSection(): string {
    const url = this.router.url;
    if (url.startsWith('/workspace/reminder')) return 'reminder';
    if (url.startsWith('/workspace/plan')) return 'plan';
    if (url.startsWith('/workspace/regression')) return 'regression';
    if (url.startsWith('/workspace/task-records')) return 'task-records';
    return 'dev-agent';
  }

  openSection(value: string) {
    this.router.navigate([`/workspace/${value}`]);
  }
}
