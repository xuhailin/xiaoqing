import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MemoryPersonaPageComponent } from './memory-persona-page.component';
import { MemoryRelationsPageComponent } from './memory-relations-page.component';
import { MemoryUnderstandingPageComponent } from './memory-understanding-page.component';

@Component({
  selector: 'app-memory-hub',
  standalone: true,
  imports: [
    MemoryPersonaPageComponent,
    MemoryRelationsPageComponent,
    MemoryUnderstandingPageComponent,
  ],
  template: `
    <div class="memory-hub">
      @if (currentView() === 'understanding') {
        <app-memory-understanding-page />
      }

      @if (currentView() === 'relations') {
        <app-memory-relations-page />
      }

      @if (currentView() === 'persona') {
        <app-memory-persona-page />
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .memory-hub {
      height: 100%;
      min-height: 0;
      overflow: auto;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryHubComponent {
  private readonly router = inject(Router);

  protected readonly currentView = () => {
    const url = this.router.url;
    if (url.startsWith('/memory/relations')) return 'relations';
    if (url.startsWith('/memory/persona')) return 'persona';
    return 'understanding';
  };
}
