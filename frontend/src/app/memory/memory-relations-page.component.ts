import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { RelationOverviewComponent } from './relation-overview.component';
import { RelationSharedExperiencesComponent } from './relation-shared-experiences.component';

@Component({
  selector: 'app-memory-relations-page',
  standalone: true,
  imports: [
    AppPageHeaderComponent,
    RelationOverviewComponent,
    RelationSharedExperiencesComponent,
  ],
  template: `
    <div class="relations-page">
      <app-page-header
        class="relations-page__header"
        title="关系"
        description="我们之间的相处状态和共同经历。"
      />
      <app-relation-overview class="relations-page__hero" />
      <app-relation-shared-experiences class="relations-page__timeline" />
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
    .relations-page__header {
      width: min(100%, var(--content-max-width));
      margin: 0 auto;
    }

    .relations-page__timeline {
      width: min(100%, calc(var(--content-max-width) + 80px));
    }

    @media (max-width: 980px) {
      .relations-page__timeline {
        width: min(100%, var(--content-max-width));
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
