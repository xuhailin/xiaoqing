import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-memory-page',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="memory-page">
      <main class="memory-content">
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

    .memory-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--page-shell-background);
    }

    .memory-content {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryPageComponent {}
