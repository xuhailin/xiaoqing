import { Component, signal } from '@angular/core';
import { IdentityAnchorEditorComponent } from '../identity-anchor/identity-anchor-editor.component';
import { MemoryListComponent } from './memory-list.component';
import { MemoryProposalsComponent } from './memory-proposals.component';
import { LifeTraceBoardComponent } from '../life-trace/life-trace-board.component';
import { RelationEntityListComponent } from './relation-entity-list.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';

@Component({
  selector: 'app-memory-understanding-page',
  standalone: true,
  imports: [
    IdentityAnchorEditorComponent,
    MemoryListComponent,
    MemoryProposalsComponent,
    LifeTraceBoardComponent,
    RelationEntityListComponent,
    AppPanelComponent,
    AppPageHeaderComponent,
    AppSectionHeaderComponent,
    AppIconComponent,
  ],
  template: `
    <div class="memory-page">
      <app-page-header
        class="memory-page__header"
        title="痕迹"
        description="你跟我说过的，和我留意到的，都放在这里。"
      />

      <div class="memory-page__body">
        <div class="understanding-grid">
          <app-panel variant="subtle" class="understanding-card">
            <app-section-header class="card-header" title="你跟我说过的" />
            <p class="card-desc">你主动告诉我的身份信息，我会一直记着。</p>
            <app-identity-anchor-editor />
          </app-panel>

          <app-panel variant="workbench" class="understanding-card">
            <app-section-header class="card-header" title="我留意到的" />
            <p class="card-desc">从对话里留意到的你的习惯、在意的事。</p>
            <app-memory-list />
          </app-panel>
        </div>

        <app-memory-proposals />

        <!-- 生活轨迹折叠区块 -->
        <div class="life-trace-section">
          <button
            type="button"
            class="life-trace-toggle"
            (click)="lifeTraceExpanded.set(!lifeTraceExpanded())"
          >
            <app-icon
              [name]="lifeTraceExpanded() ? 'chevronDown' : 'chevronRight'"
              size="0.9rem"
            />
            <span class="life-trace-toggle__title">生活轨迹</span>
            <span class="life-trace-toggle__hint">从对话里提炼的事件和日常</span>
          </button>

          @if (lifeTraceExpanded()) {
            <div class="life-trace-content">
              <app-life-trace-board />
            </div>
          }
        </div>

        <div class="people-section">
          <button
            type="button"
            class="people-toggle"
            (click)="peopleExpanded.set(!peopleExpanded())"
          >
            <app-icon
              [name]="peopleExpanded() ? 'chevronDown' : 'chevronRight'"
              size="0.9rem"
            />
            <span class="toggle__title">身边的人</span>
            <span class="toggle__hint">你生活里反复出现的人</span>
          </button>

          @if (peopleExpanded()) {
            <div class="people-content">
              <app-relation-entity-list />
            </div>
          }
        </div>
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
      grid-template-columns: 320px minmax(0, 1fr);
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

    .life-trace-section {
      margin-top: var(--space-6);
      border-top: 1px solid var(--color-border-light);
      padding-top: var(--space-5);
    }

    .life-trace-toggle {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      cursor: pointer;
      transition: background var(--transition-base), border-color var(--transition-base);
    }

    .life-trace-toggle:hover {
      background: var(--color-surface-hover);
      border-color: var(--color-border);
    }

    .life-trace-toggle__title {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .life-trace-toggle__hint {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin-left: auto;
    }

    .life-trace-content {
      margin-top: var(--space-4);
      border-radius: var(--radius-md);
      overflow: hidden;
    }

    .people-section {
      margin-top: var(--space-5);
      border-top: 1px solid var(--color-border-light);
      padding-top: var(--space-5);
    }

    .people-toggle {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      cursor: pointer;
      transition: background var(--transition-base), border-color var(--transition-base);
    }

    .people-toggle:hover {
      background: var(--color-surface-hover);
      border-color: var(--color-border);
    }

    .toggle__title {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .toggle__hint {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin-left: auto;
    }

    .people-content {
      margin-top: var(--space-4);
    }
  `],
})
export class MemoryUnderstandingPageComponent {
  protected readonly lifeTraceExpanded = signal(false);
  protected readonly peopleExpanded = signal(false);
}
