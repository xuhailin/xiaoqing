import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';
import { RelationEntityListComponent } from '../relation-entity-list.component';

@Component({
  selector: 'app-people-page',
  standalone: true,
  imports: [AppPageHeaderComponent, RelationEntityListComponent],
  template: `
    <div class="page-container">
      <app-page-header
        class="page-container__header"
        title="身边的人"
        description="你生活里反复出现的人，我会帮你记住他们。"
      />
      <div class="page-content">
        <app-relation-entity-list />
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .page-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--workbench-shell-padding);
      overflow: auto;
    }

    .page-container__header {
      margin-bottom: var(--space-4);
    }

    .page-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeoplePageComponent {}
