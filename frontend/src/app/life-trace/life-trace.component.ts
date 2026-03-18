import { Component } from '@angular/core';
import { HomeTimelineComponent } from '../chat/home-timeline.component';

@Component({
  selector: 'app-life-trace',
  standalone: true,
  imports: [HomeTimelineComponent],
  template: `
    <div class="life-trace-page">
      <app-home-timeline />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .life-trace-page {
      min-height: 100%;
      padding: var(--workbench-shell-padding);
    }

    @media (max-width: 760px) {
      .life-trace-page {
        padding: var(--workbench-shell-padding-mobile);
      }
    }
  `],
})
export class LifeTraceComponent {}
