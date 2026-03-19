import { Component } from '@angular/core';
import { MemoryListComponent } from './memory-list.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';

@Component({
  selector: 'app-memory-long-memory-page',
  standalone: true,
  imports: [MemoryListComponent, AppPageHeaderComponent, AppPanelComponent],
  template: `
    <div class="memory-page">
      <app-page-header
        eyebrow="Memory"
        title="Long Memory"
        description="阶段记忆、长期记忆与待确认成长记录统一放在这里。"
      />

      <app-panel variant="workbench" class="memory-card">
        <app-memory-list />
      </app-panel>
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
      gap: var(--workbench-stack-gap);
      min-height: 100%;
    }

    .memory-card {
      min-height: 0;
    }

    @media (max-width: 980px) {
      .memory-page {
        padding: var(--workbench-shell-padding-mobile);
      }
    }
  `],
})
export class MemoryLongMemoryPageComponent {}
