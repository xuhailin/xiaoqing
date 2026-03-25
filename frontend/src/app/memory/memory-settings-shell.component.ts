import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MemoryNavComponent } from './memory-nav.component';

@Component({
  selector: 'app-memory-settings-shell',
  standalone: true,
  imports: [RouterOutlet, MemoryNavComponent],
  template: `
    <div class="settings-shell">
      <app-memory-nav class="settings-shell__nav" />
      <main class="settings-shell__content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .settings-shell {
      display: flex;
      height: 100%;
      min-height: 0;
    }

    .settings-shell__nav {
      flex-shrink: 0;
    }

    .settings-shell__content {
      flex: 1;
      min-width: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
    }

    @media (max-width: 768px) {
      .settings-shell {
        flex-direction: column;
      }

      .settings-shell__nav {
        width: 100%;
        height: auto;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemorySettingsShellComponent {}
