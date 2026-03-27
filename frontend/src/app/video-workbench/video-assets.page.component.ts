import { Component } from '@angular/core';
import { VideoAssetsPanelComponent } from './components/video-assets-panel.component';

@Component({
  selector: 'app-video-assets-page',
  standalone: true,
  imports: [VideoAssetsPanelComponent],
  template: `
    <div class="assets-page">
      <div class="assets-page__content">
        <app-video-assets-panel />
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

      .assets-page {
        max-width: 980px;
        margin: 0 auto;
        padding-block: var(--space-4);
      }

      .assets-page__content {
        min-width: 0;
      }
    `,
  ],
})
export class VideoAssetsPageComponent {}
