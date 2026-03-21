import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-workspace-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="workspace-shell">
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
      --bg-page: var(--color-bg);
      --workbench-surface-gradient:
        linear-gradient(180deg, rgba(255, 255, 255, 0.48), rgba(248, 250, 255, 0.3));
      --workbench-surface-gradient-soft:
        linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(248, 250, 255, 0.26));
      --sidebar-card-background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.36), rgba(248, 250, 255, 0.24));
      --sidebar-card-background-active:
        linear-gradient(180deg, rgba(255, 255, 255, 0.54), rgba(244, 247, 255, 0.42));
      --workbench-surface-shadow:
        0 16px 34px rgba(83, 104, 150, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.46);
      --color-list-card-shadow:
        0 10px 24px rgba(83, 104, 150, 0.05);
      --color-list-card-hover-bg:
        linear-gradient(180deg, rgba(255, 255, 255, 0.56), rgba(246, 249, 255, 0.4));
      --color-list-card-hover-border: rgba(96, 122, 170, 0.22);
      --color-list-card-active-shadow:
        inset 0 0 0 1px rgba(79, 109, 245, 0.16), 0 10px 24px rgba(79, 109, 245, 0.08);
      --color-surface-highlight: rgba(244, 248, 255, 0.96);
      --color-surface-highlight-border: rgba(79, 109, 245, 0.16);
      --color-surface-highlight-shadow:
        inset 0 0 0 1px rgba(79, 109, 245, 0.12), 0 10px 22px rgba(79, 109, 245, 0.08);
      height: 100%;
      min-height: 0;
      display: block;
      padding: 0;
      background: var(--bg-page);
    }

    .workspace-stage {
      height: 100%;
      min-height: 0;
      min-width: 0;
      overflow: auto;
      background: var(--bg-page);
    }

    .workspace-shell ::ng-deep .ui-panel--workbench,
    .workspace-shell ::ng-deep .ui-list-card,
    .workspace-shell ::ng-deep .ui-workbench-surface,
    .workspace-shell ::ng-deep .ui-workbench-card {
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    :host-context([data-theme='dark']) .workspace-shell {
      --bg-page: var(--color-bg);
      --workbench-surface-gradient:
        linear-gradient(180deg, rgba(25, 33, 49, 0.54), rgba(20, 27, 41, 0.42));
      --workbench-surface-gradient-soft:
        linear-gradient(180deg, rgba(29, 38, 57, 0.48), rgba(22, 29, 43, 0.4));
      --sidebar-card-background:
        linear-gradient(180deg, rgba(25, 33, 49, 0.42), rgba(20, 27, 41, 0.34));
      --sidebar-card-background-active:
        linear-gradient(180deg, rgba(39, 49, 76, 0.66), rgba(28, 37, 57, 0.52));
      --workbench-surface-shadow:
        0 18px 38px rgba(2, 6, 18, 0.24), inset 0 1px 0 rgba(160, 176, 255, 0.05);
      --color-list-card-shadow:
        0 12px 26px rgba(2, 6, 18, 0.18);
      --color-list-card-hover-bg:
        linear-gradient(180deg, rgba(31, 40, 61, 0.72), rgba(24, 32, 49, 0.64));
      --color-list-card-hover-border: rgba(154, 173, 228, 0.26);
      --color-list-card-active-shadow:
        inset 0 0 0 1px rgba(123, 143, 255, 0.22), 0 12px 26px rgba(56, 80, 174, 0.18);
      --color-surface-highlight: rgba(31, 41, 64, 0.98);
      --color-surface-highlight-border: rgba(123, 143, 255, 0.24);
      --color-surface-highlight-shadow:
        inset 0 0 0 1px rgba(123, 143, 255, 0.2), 0 12px 28px rgba(56, 80, 174, 0.18);
    }
  `],
})
export class WorkspaceShellComponent {}
