import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RelationEntityListComponent } from './relation-entity-list.component';
import { RelationInsightsComponent } from './relation-insights.component';
import { RelationOverviewComponent } from './relation-overview.component';
import { RelationSharedExperiencesComponent } from './relation-shared-experiences.component';

@Component({
  selector: 'app-memory-relations-page',
  standalone: true,
  imports: [
    RelationEntityListComponent,
    RelationInsightsComponent,
    RelationOverviewComponent,
    RelationSharedExperiencesComponent,
  ],
  template: `
    <div class="relations-page">
      <app-relation-overview class="relations-page__overview" />

      <div class="relations-page__grid">
        <div class="relations-page__main">
          <app-relation-entity-list />
          <app-relation-insights />
        </div>

        <div class="relations-page__side">
          <app-relation-shared-experiences />
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 0;
    }

    .relations-page {
      display: flex;
      flex-direction: column;
      gap: var(--workbench-section-gap);
      min-height: 0;
    }

    .relations-page__overview {
      min-height: 0;
    }

    .relations-page__grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
      gap: var(--workbench-section-gap);
      align-items: start;
      min-height: 0;
    }

    .relations-page__main,
    .relations-page__side {
      display: flex;
      flex-direction: column;
      gap: var(--workbench-section-gap);
      min-height: 0;
    }

    @media (max-width: 1180px) {
      .relations-page__grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryRelationsPageComponent {}
