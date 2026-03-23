import { Component } from '@angular/core';
import { IdentityAnchorEditorComponent } from '../identity-anchor/identity-anchor-editor.component';
import { MemoryListComponent } from './memory-list.component';
import { MemoryProposalsComponent } from './memory-proposals.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';

@Component({
  selector: 'app-memory-understanding-page',
  standalone: true,
  imports: [
    IdentityAnchorEditorComponent,
    MemoryListComponent,
    MemoryProposalsComponent,
    AppPanelComponent,
    AppSectionHeaderComponent,
  ],
  template: `
    <div class="understanding-page">
      <div class="understanding-grid">
        <app-panel variant="workbench" class="understanding-card">
          <app-section-header class="card-header" title="你告诉我的" />
          <p class="card-desc">你主动设定的身份锚定 — 这些信息不会随时间衰减，始终作为小晴了解你的稳定基础。</p>
          <app-identity-anchor-editor />
        </app-panel>

        <app-panel variant="workbench" class="understanding-card">
          <app-section-header class="card-header" title="我从对话中理解到的" />
          <p class="card-desc">从持续对话里积累的阶段记忆、长期印象、偏好模式和待确认的认知变化。</p>
          <app-memory-list />
        </app-panel>
      </div>

      <app-memory-proposals />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .understanding-page {
      padding: var(--workbench-shell-padding);
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
      min-height: 100%;
    }

    .understanding-grid {
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
      gap: var(--workbench-section-gap);
      min-height: 0;
      align-items: start;
    }

    .understanding-card {
      min-height: 0;
    }

    .card-header {
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-light);
    }

    .card-desc {
      margin: var(--space-3) 0 var(--space-4);
      font-size: var(--font-size-sm);
      line-height: 1.65;
      color: var(--color-text-secondary);
    }

    @media (max-width: 980px) {
      .understanding-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .understanding-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class MemoryUnderstandingPageComponent {}
