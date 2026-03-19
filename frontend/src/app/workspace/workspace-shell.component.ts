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
      height: 100%;
      min-height: 0;
      display: block;
      padding: 0;
    }

    .workspace-stage {
      height: 100%;
      min-height: 0;
      min-width: 0;
      overflow: auto;
    }
  `],
})
export class WorkspaceShellComponent {}
