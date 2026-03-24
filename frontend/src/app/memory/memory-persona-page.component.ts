import { Component } from '@angular/core';
import { PersonaConfigComponent } from '../persona/persona-config.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';

@Component({
  selector: 'app-memory-persona-page',
  standalone: true,
  imports: [PersonaConfigComponent, AppPageHeaderComponent, AppPanelComponent],
  template: `
    <div class="memory-page">
      <app-page-header
        class="memory-page__header"
        title="设置"
        description="助手的人格设定与进化方向。"
      />

      <div class="memory-grid">
        <app-panel variant="workbench" class="persona-card">
          <app-persona-config />
        </app-panel>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .memory-page {
      padding: var(--workbench-shell-padding);
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      min-height: 100%;
    }

    .memory-page__header,
    .memory-grid {
      width: min(100%, var(--content-max-width));
      margin: 0 auto;
    }

    .memory-grid {
      min-height: 0;
    }

    .persona-card {
      min-height: 0;
      gap: var(--space-4);
    }

    @media (max-width: 980px) {
      .memory-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .memory-grid {
        gap: var(--space-4);
      }
    }
  `],
})
export class MemoryPersonaPageComponent {}
