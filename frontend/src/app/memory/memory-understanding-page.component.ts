import { Component } from '@angular/core';
import { IdentityAnchorEditorComponent } from '../identity-anchor/identity-anchor-editor.component';
import { MemoryListComponent } from './memory-list.component';
import { MemoryProposalsComponent } from './memory-proposals.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';

@Component({
  selector: 'app-memory-understanding-page',
  standalone: true,
  imports: [
    IdentityAnchorEditorComponent,
    MemoryListComponent,
    MemoryProposalsComponent,
    AppPanelComponent,
    AppPageHeaderComponent,
    AppSectionHeaderComponent,
  ],
  template: `
    <div class="memory-page">
      <app-page-header
        class="memory-page__header"
        eyebrow="Memory"
        title="理解与记忆"
        description="把你明确告诉我的、我从对话中持续理解到的，以及待确认的记忆提案放在同一条安静的认知链路里。"
      />

      <div class="memory-page__body">
        <div class="understanding-grid">
          <app-panel variant="subtle" class="understanding-card">
            <app-section-header class="card-header" title="你告诉我的" />
            <p class="card-desc">你主动设定的身份锚定，这些信息不会随时间衰减，会一直作为小晴理解你的稳定基础。</p>
            <app-identity-anchor-editor />
          </app-panel>

          <app-panel variant="workbench" class="understanding-card">
            <app-section-header class="card-header" title="我从对话中理解到的" />
            <p class="card-desc">从持续对话里积累出的阶段记忆、长期印象、偏好模式和待确认的认知变化。</p>
            <app-memory-list />
          </app-panel>
        </div>

        <app-memory-proposals />
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
    .memory-page__body {
      width: min(100%, var(--content-max-width));
      margin: 0 auto;
    }

    .memory-page__body {
      display: flex;
      flex-direction: column;
      gap: var(--workbench-section-gap);
      min-height: 0;
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
      gap: var(--space-4);
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
      .memory-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .understanding-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class MemoryUnderstandingPageComponent {}
