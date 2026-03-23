import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LifeTraceBoardComponent } from '../life-trace/life-trace-board.component';
import { PersonaConfigComponent } from '../persona/persona-config.component';
import { CognitiveTraceBoardComponent } from '../cognitive-trace/cognitive-trace-board.component';
import { MemoryRelationsPageComponent } from './memory-relations-page.component';
import { MemoryUnderstandingPageComponent } from './memory-understanding-page.component';

@Component({
  selector: 'app-memory-hub',
  standalone: true,
  imports: [
    LifeTraceBoardComponent,
    PersonaConfigComponent,
    CognitiveTraceBoardComponent,
    MemoryRelationsPageComponent,
    MemoryUnderstandingPageComponent,
  ],
  template: `
    <div class="memory-hub">
      @if (currentView() === 'understanding') {
        <app-memory-understanding-page />
      }

      @if (currentView() === 'life-record') {
        <app-life-trace-board />
      }

      @if (currentView() === 'cognitive-trace') {
        <app-cognitive-trace-board />
      }

      @if (currentView() === 'relations') {
        <app-memory-relations-page />
      }

      @if (currentView() === 'persona') {
        <app-persona-config />
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
    if (url.startsWith('/memory/life-record')) return 'life-record';
    if (url.startsWith('/memory/cognitive-trace')) return 'cognitive-trace';
    if (url.startsWith('/memory/persona')) return 'persona';
    return 'understanding';
  };
}
