import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { RelationEntityListComponent } from './relation-entity-list.component';
import { RelationInsightsComponent } from './relation-insights.component';
import { RelationOverviewComponent } from './relation-overview.component';
import { RelationSharedExperiencesComponent } from './relation-shared-experiences.component';

@Component({
  selector: 'app-memory-relations-page',
  standalone: true,
  imports: [
    AppPageHeaderComponent,
    RelationEntityListComponent,
    RelationInsightsComponent,
    RelationOverviewComponent,
    RelationSharedExperiencesComponent,
  ],
  template: `
    <div class="relations-page">
      <app-page-header
        class="relations-page__header"
        eyebrow="Relationship"
        title="你和小晴"
        description="这里不只是关系数据，而是小晴如何理解你们这段关系正在怎样变化、哪些片段变成了共同经历，以及你生活里哪些人正在反复出现。"
      />
      <app-relation-overview class="relations-page__hero" />
      <app-relation-shared-experiences class="relations-page__timeline" />

      <div class="relations-page__secondary">
        <app-relation-entity-list class="relations-page__people" />
        <app-relation-insights class="relations-page__insights" />
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 0;
    }

    .relations-page {
      padding: var(--workbench-shell-padding);
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      min-height: 0;
    }

    .relations-page__hero,
    .relations-page__timeline,
    .relations-page__secondary,
    .relations-page__header {
      width: min(100%, var(--content-max-width));
      margin: 0 auto;
    }

    .relations-page__timeline {
      width: min(100%, calc(var(--content-max-width) + 80px));
    }

    .relations-page__secondary {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
      gap: var(--space-5);
      align-items: start;
    }

    .relations-page__people,
    .relations-page__insights {
      padding-bottom: var(--space-4);
    }

    @media (max-width: 980px) {
      .relations-page__timeline {
        width: min(100%, var(--content-max-width));
      }

      .relations-page__secondary {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 1180px) {
      .relations-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .relations-page {
        gap: var(--space-5);
      }
    }

    @media (max-width: 640px) {
      .relations-page {
        gap: var(--space-4);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryRelationsPageComponent {}
