import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LifeTraceBoardComponent } from '../../life-trace/life-trace-board.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';

@Component({
  selector: 'app-life-trace-page',
  standalone: true,
  imports: [AppPageHeaderComponent, LifeTraceBoardComponent],
  template: `
    <div class="page-container">
      <app-page-header
        class="page-container__header"
        title="生活轨迹"
        description="从对话里提炼的事件和日常，记录你生活中的重要片段。"
      />
      <div class="page-content">
        <app-life-trace-board />
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
export class LifeTracePageComponent {}
