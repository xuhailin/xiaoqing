import { Component } from '@angular/core';
import { VideoHistoryPanelComponent } from './components/video-history-panel.component';

@Component({
  selector: 'app-video-history-page',
  standalone: true,
  imports: [VideoHistoryPanelComponent],
  template: `
    <div class="history-page">
      <div class="history-page__content">
        <app-video-history-panel />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100%;
        padding: var(--workbench-shell-padding);
        background: var(--workbench-shell-background);
        overflow-y: auto;
      }

      .history-page {
        max-width: 980px;
        margin: 0 auto;
        padding-block: var(--space-4);
      }

      .history-page__content {
        min-width: 0;
      }
    `,
  ],
})
export class VideoHistoryPageComponent {}
