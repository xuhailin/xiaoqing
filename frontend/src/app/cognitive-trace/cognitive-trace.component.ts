import { Component } from '@angular/core';
import { CognitiveTraceBoardComponent } from './cognitive-trace-board.component';

@Component({
  selector: 'app-cognitive-trace',
  standalone: true,
  imports: [CognitiveTraceBoardComponent],
  template: `
    <div class="cognitive-trace-page">
      <app-cognitive-trace-board />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .cognitive-trace-page {
      min-height: 100%;
      padding: var(--workbench-shell-padding);
    }

    @media (max-width: 760px) {
      .cognitive-trace-page {
        padding: var(--workbench-shell-padding-mobile);
      }
    }
  `],
})
export class CognitiveTraceComponent {}
